"""3-state Gaussian HMM fit, decode and traffic-light regime mapping.

Primary engine: ``hmmlearn.hmm.GaussianHMM`` when the package is importable. If it is not
installed, a self-contained pure-numpy Gaussian Baum-Welch (forward-backward in log space)
plus Viterbi fallback is used instead. The engine that ran is recorded in the result under
``"engine"`` so callers (and the JSON artifact) can tell which path was taken.

Determinism: a single module constant :data:`SEED` (42) seeds both paths, so repeated runs
produce identical parameters. The input is standardized (z-scored) only for fitting
stability; all reported means and variances are converted back to the original kWh scale.

Regime mapping: the three fitted states are sorted by ascending mean consumption and mapped
to a traffic-light regime — GREEN = lowest mean (good / low use), GREY = middle, RED =
highest mean (too-much use). Every output array is re-indexed into this canonical
mean-ascending order so results are stable across runs regardless of the engine's internal
state indexing.

All functions here are pure and importable: no file I/O and no printing.
"""
from __future__ import annotations

from typing import Dict, List

import numpy as np

SEED = 42
N_ITER = 200
TOL = 1e-4

# Canonical traffic-light regimes, ordered by ascending state mean.
REGIME_ORDER = ["GREEN", "GREY", "RED"]


# --------------------------------------------------------------------------- #
# Pure-numpy Gaussian HMM fallback (used only when hmmlearn is unavailable).
# --------------------------------------------------------------------------- #
def _log_gaussian(x: np.ndarray, means: np.ndarray, variances: np.ndarray) -> np.ndarray:
    """Log pdf of each (standardized, 1-D) observation under each Gaussian state.

    Returns an ``(n_obs, n_states)`` array of log densities.
    """
    var = variances[np.newaxis, :]
    diff = x[:, np.newaxis] - means[np.newaxis, :]
    return -0.5 * (np.log(2.0 * np.pi * var) + (diff * diff) / var)


def _forward_backward(log_startprob, log_transmat, log_emit):
    """Log-space forward-backward. Returns (log_alpha, log_beta, log_likelihood)."""
    n_obs, n_states = log_emit.shape
    log_alpha = np.empty((n_obs, n_states))
    log_beta = np.zeros((n_obs, n_states))

    log_alpha[0] = log_startprob + log_emit[0]
    for t in range(1, n_obs):
        for j in range(n_states):
            log_alpha[t, j] = (
                _logsumexp(log_alpha[t - 1] + log_transmat[:, j]) + log_emit[t, j]
            )

    for t in range(n_obs - 2, -1, -1):
        for i in range(n_states):
            log_beta[t, i] = _logsumexp(
                log_transmat[i, :] + log_emit[t + 1] + log_beta[t + 1]
            )

    log_likelihood = _logsumexp(log_alpha[-1])
    return log_alpha, log_beta, log_likelihood


def _logsumexp(v: np.ndarray) -> float:
    m = np.max(v)
    if not np.isfinite(m):
        return float(m)
    return float(m + np.log(np.sum(np.exp(v - m))))


def _fit_numpy(x_std: np.ndarray, n_states: int, rng: np.random.Generator):
    """Baum-Welch EM for a 1-D Gaussian HMM on standardized data.

    Returns (startprob, transmat, means_std, variances_std, loglik_history).
    """
    n_obs = x_std.shape[0]

    # Deterministic init: spread the state means across quantiles of the data.
    qs = np.linspace(0.1, 0.9, n_states)
    means = np.quantile(x_std, qs).astype(np.float64)
    means += rng.normal(0.0, 1e-3, size=n_states)  # tiny seeded jitter breaks ties
    variances = np.full(n_states, float(np.var(x_std)) + 1e-3)
    startprob = np.full(n_states, 1.0 / n_states)
    transmat = np.full((n_states, n_states), 1.0 / n_states)

    history: List[float] = []
    prev_ll = -np.inf
    min_var = 1e-4

    for _ in range(N_ITER):
        log_emit = _log_gaussian(x_std, means, variances)
        log_startprob = np.log(startprob + 1e-300)
        log_transmat = np.log(transmat + 1e-300)

        log_alpha, log_beta, ll = _forward_backward(log_startprob, log_transmat, log_emit)
        history.append(float(ll))

        # Posterior state probabilities gamma[t, i].
        log_gamma = log_alpha + log_beta
        log_gamma -= log_gamma.max(axis=1, keepdims=True)
        gamma = np.exp(log_gamma)
        gamma /= gamma.sum(axis=1, keepdims=True)

        # Pairwise posteriors xi, summed over t, for the transition update.
        xi_sum = np.zeros((n_states, n_states))
        for t in range(n_obs - 1):
            log_xi = (
                log_alpha[t][:, np.newaxis]
                + log_transmat
                + log_emit[t + 1][np.newaxis, :]
                + log_beta[t + 1][np.newaxis, :]
            )
            log_xi -= _logsumexp(log_xi.reshape(-1))
            xi_sum += np.exp(log_xi)

        # M-step.
        startprob = gamma[0] / gamma[0].sum()
        denom = xi_sum.sum(axis=1, keepdims=True)
        denom[denom == 0.0] = 1.0
        transmat = xi_sum / denom

        weights = gamma.sum(axis=0)
        weights[weights == 0.0] = 1e-300
        means = (gamma * x_std[:, np.newaxis]).sum(axis=0) / weights
        diff = x_std[:, np.newaxis] - means[np.newaxis, :]
        variances = (gamma * diff * diff).sum(axis=0) / weights
        variances = np.maximum(variances, min_var)

        if ll - prev_ll < TOL and _ > 0:
            break
        prev_ll = ll

    return startprob, transmat, means, variances, history


def _viterbi(x_std, startprob, transmat, means_std, variances_std) -> np.ndarray:
    """Most-likely state path for the standardized series (log space)."""
    log_emit = _log_gaussian(x_std, means_std, variances_std)
    log_startprob = np.log(startprob + 1e-300)
    log_transmat = np.log(transmat + 1e-300)
    n_obs, n_states = log_emit.shape

    delta = np.empty((n_obs, n_states))
    psi = np.zeros((n_obs, n_states), dtype=int)
    delta[0] = log_startprob + log_emit[0]
    for t in range(1, n_obs):
        for j in range(n_states):
            scores = delta[t - 1] + log_transmat[:, j]
            psi[t, j] = int(np.argmax(scores))
            delta[t, j] = scores[psi[t, j]] + log_emit[t, j]

    path = np.empty(n_obs, dtype=int)
    path[-1] = int(np.argmax(delta[-1]))
    for t in range(n_obs - 2, -1, -1):
        path[t] = psi[t + 1, path[t + 1]]
    return path


# --------------------------------------------------------------------------- #
# Stationary distribution (shared by both engines).
# --------------------------------------------------------------------------- #
def _stationary_distribution(transmat: np.ndarray) -> np.ndarray:
    """Left eigenvector of the transition matrix for eigenvalue 1, normalized to sum 1."""
    values, vectors = np.linalg.eig(transmat.T)
    idx = int(np.argmin(np.abs(values - 1.0)))
    vec = np.real(vectors[:, idx])
    vec = np.abs(vec)
    total = vec.sum()
    if total == 0.0:
        return np.full(transmat.shape[0], 1.0 / transmat.shape[0])
    return vec / total


# --------------------------------------------------------------------------- #
# Public API.
# --------------------------------------------------------------------------- #
def fit_regimes(values: np.ndarray, n_states: int = 3) -> Dict:
    """Fit an ``n_states`` Gaussian HMM to a 1-D consumption series.

    The series is z-scored for fitting stability; the returned means and variances are in
    the original kWh scale. State indexing follows the engine's internal order here — call
    :func:`map_regimes` to get the canonical GREEN/GREY/RED mean-ascending ordering.

    Args:
        values: 1-D array of monthly consumption observations (chronological order).
        n_states: number of hidden states (3 for the FairWatt traffic-light model).

    Returns:
        Dict with keys: ``engine``, ``converged``, ``n_states``, ``means``, ``variances``,
        ``transition_matrix``, ``startprob``, ``stationary_distribution``, ``path``
        (Viterbi state sequence), ``log_likelihood`` and ``log_likelihood_trajectory``.
    """
    values = np.asarray(values, dtype=np.float64)
    if values.ndim != 1:
        raise ValueError("values must be a 1-D series")

    mean = float(values.mean())
    std = float(values.std())
    if std == 0.0:
        raise ValueError("series has zero variance; cannot fit an HMM")
    x_std = (values - mean) / std

    try:
        from hmmlearn.hmm import GaussianHMM  # noqa: WPS433 (runtime import is intentional)

        engine = "hmmlearn"
        model = GaussianHMM(
            n_components=n_states,
            covariance_type="diag",
            n_iter=N_ITER,
            tol=TOL,
            random_state=SEED,
        )
        model.fit(x_std.reshape(-1, 1))
        path = model.predict(x_std.reshape(-1, 1))
        startprob = np.asarray(model.startprob_, dtype=np.float64)
        transmat = np.asarray(model.transmat_, dtype=np.float64)
        means_std = np.asarray(model.means_, dtype=np.float64).ravel()
        variances_std = np.asarray(model.covars_, dtype=np.float64).ravel()
        history = [float(v) for v in model.monitor_.history]
        converged = bool(model.monitor_.converged)
    except ImportError:
        engine = "numpy-fallback"
        rng = np.random.default_rng(SEED)
        startprob, transmat, means_std, variances_std, history = _fit_numpy(
            x_std, n_states, rng
        )
        path = _viterbi(x_std, startprob, transmat, means_std, variances_std)
        # Converged if the final EM log-likelihood gain fell below TOL.
        converged = len(history) >= 2 and (history[-1] - history[-2]) < TOL

    # Convert standardized parameters back to the original kWh scale.
    means = means_std * std + mean
    variances = variances_std * (std ** 2)

    stationary = _stationary_distribution(transmat)

    return {
        "engine": engine,
        "converged": converged,
        "n_states": n_states,
        "means": means,
        "variances": variances,
        "transition_matrix": transmat,
        "startprob": startprob,
        "stationary_distribution": stationary,
        "path": np.asarray(path, dtype=int),
        "log_likelihood": float(history[-1]) if history else float("nan"),
        "log_likelihood_trajectory": [float(v) for v in history],
    }


def map_regimes(result: Dict) -> Dict:
    """Re-index a :func:`fit_regimes` result into canonical GREEN/GREY/RED order.

    States are sorted by ascending mean consumption; state 0 becomes GREEN (lowest / good
    use), state 1 GREY, state 2 RED (highest / too-much use). The means, variances,
    transition matrix (rows and columns), stationary distribution and the decoded Viterbi
    path are all remapped into this order. The regime labels are added alongside.

    Args:
        result: the dict returned by :func:`fit_regimes`.

    Returns:
        A new dict (the input is not mutated) carrying the canonically ordered arrays plus
        ``regime_by_state`` (list aligned to the sorted states) and ``regime_mapping``
        (``{"GREEN": 0, "GREY": 1, "RED": 2}``).
    """
    means = np.asarray(result["means"], dtype=np.float64)
    n_states = int(result["n_states"])
    if n_states != len(REGIME_ORDER):
        raise ValueError(
            f"regime mapping is defined for {len(REGIME_ORDER)} states, got {n_states}"
        )

    # order[k] = old index that becomes new slot k (ascending by mean).
    order = np.argsort(means, kind="stable")
    # old_to_new[old_index] = new slot.
    old_to_new = np.empty(n_states, dtype=int)
    for new_idx, old_idx in enumerate(order):
        old_to_new[old_idx] = new_idx

    transmat = np.asarray(result["transition_matrix"], dtype=np.float64)
    sorted_transmat = transmat[np.ix_(order, order)]

    mapped = dict(result)
    mapped["means"] = means[order]
    mapped["variances"] = np.asarray(result["variances"], dtype=np.float64)[order]
    mapped["transition_matrix"] = sorted_transmat
    mapped["startprob"] = np.asarray(result["startprob"], dtype=np.float64)[order]
    mapped["stationary_distribution"] = np.asarray(
        result["stationary_distribution"], dtype=np.float64
    )[order]
    mapped["path"] = old_to_new[np.asarray(result["path"], dtype=int)]
    mapped["regime_by_state"] = list(REGIME_ORDER)
    mapped["regime_mapping"] = {name: idx for idx, name in enumerate(REGIME_ORDER)}
    return mapped
