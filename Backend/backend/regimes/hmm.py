"""Hand-rolled 1-D Gaussian HMM: Baum-Welch fit, forward filter, states sorted by mean (hmmlearn is not installed).

Scaled forward-backward (Rabiner). Everything is deterministic given the seed. States are always returned in
ascending order of their mean, so index 0/1/2 = green/grey/red after every fit (no label switching).
"""
import math

import numpy as np

SQRT2PI = math.sqrt(2 * math.pi)


def emissions(x, mu, sd):
    z = (x[:, None] - mu[None, :]) / sd[None, :]
    return np.exp(-0.5 * z * z) / (sd[None, :] * SQRT2PI) + 1e-300


def _forward_backward(b, pi, A):
    T, K = b.shape
    alpha = np.empty((T, K))
    c = np.empty(T)
    a = pi * b[0]
    c[0] = a.sum()
    alpha[0] = a / c[0]
    for t in range(1, T):
        a = (alpha[t - 1] @ A) * b[t]
        c[t] = a.sum()
        alpha[t] = a / c[t]
    beta = np.empty((T, K))
    beta[-1] = 1.0
    for t in range(T - 2, -1, -1):
        beta[t] = (A @ (b[t + 1] * beta[t + 1])) / c[t + 1]
    return alpha, beta, c


def sort_params(p):
    o = np.argsort(p["mu"], kind="stable")
    return {"pi": p["pi"][o], "A": p["A"][np.ix_(o, o)], "mu": p["mu"][o], "sd": p["sd"][o],
            "loglik": p["loglik"], "iters": p["iters"]}


def fit(x, k=3, init=None, seed=0, n_init=1, max_iter=300, tol=1e-6, tied=False, fixed_mu=None, fixed_sd=None):
    """Baum-Welch on x (1-D). `init` (a params dict) warm-starts; otherwise n_init seeded random starts.

    tied=True shares one standard deviation across states, so states differ only by level (mean). That keeps a
    high-variance state from simply absorbing the peak seasons. fixed_mu anchors the state means (they are never
    re-estimated), so each state keeps a fixed meaning and the HMM learns only spread and persistence; fixed_sd also
    anchors the spread, leaving only the transition probabilities (stickiness) to learn.
    Returns the best params by log-likelihood, sorted by mean.
    """
    x = np.asarray(x, float)
    sd_floor = 0.05 * x.std()
    starts = []
    if init is not None:
        starts.append({key: np.array(init[key], float) for key in ("pi", "A", "mu", "sd")})
    rng = np.random.default_rng(seed)
    for _ in range(n_init if init is None else 0):
        q = np.quantile(x, np.linspace(0.15, 0.85, k))
        starts.append({"pi": np.full(k, 1.0 / k),
                       "A": np.full((k, k), 0.1 / (k - 1)) + np.eye(k) * (0.9 - 0.1 / (k - 1)),
                       "mu": q + rng.normal(0, 0.1 * x.std(), k), "sd": np.full(k, x.std() / 2)})
    for p in starts:
        if fixed_mu is not None:
            p["mu"] = np.array(fixed_mu, float)
        if fixed_sd is not None:
            p["sd"] = np.full(k, float(fixed_sd))
    best = None
    for p in starts:
        prev = -np.inf
        for it in range(1, max_iter + 1):
            b = emissions(x, p["mu"], p["sd"])
            alpha, beta, c = _forward_backward(b, p["pi"], p["A"])
            ll = float(np.log(c).sum())
            gamma = alpha * beta
            gamma /= gamma.sum(axis=1, keepdims=True)
            xi = (alpha[:-1, :, None] * p["A"][None, :, :] * (b[1:] * beta[1:])[:, None, :]) / c[1:, None, None]
            A = xi.sum(axis=0)
            A /= A.sum(axis=1, keepdims=True)
            w = gamma.sum(axis=0)
            mu = (gamma * x[:, None]).sum(axis=0) / w if fixed_mu is None else np.array(fixed_mu, float)
            sq = gamma * (x[:, None] - mu) ** 2
            sd = np.full(k, np.sqrt(sq.sum() / len(x))) if tied else np.sqrt(sq.sum(axis=0) / w)
            sd = np.full(k, float(fixed_sd)) if fixed_sd is not None else np.maximum(sd, sd_floor)
            p = {"pi": gamma[0], "A": A, "mu": mu, "sd": sd}
            if ll - prev < tol:
                break
            prev = ll
        p["loglik"], p["iters"] = ll, it
        if best is None or p["loglik"] > best["loglik"]:
            best = p
    return sort_params(best)


def filter_step(prev_probs, A, b_t):
    """One forward-filter step: P(state_t | x_1..x_t) from P(state_{t-1} | x_1..x_{t-1})."""
    a = (prev_probs @ A) * b_t
    return a / a.sum()


def stationary(A):
    vals, vecs = np.linalg.eig(A.T)
    v = np.real(vecs[:, np.argmin(np.abs(vals - 1))])
    return v / v.sum()
