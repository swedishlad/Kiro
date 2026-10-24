/**
 * fairwatt_mc_cpp — C++20 Monte Carlo grid decarbonization engine.
 *
 * Simulates num_paths trajectories across num_years×365 days of grid carbon
 * intensity using a mean-reverting Ornstein-Uhlenbeck process with an
 * exponentially decarbonizing long-term mean. Incorporates annual solar and
 * battery hardware degradation.
 *
 * Thread-safe: worker threads use deterministic per-thread seeds. The Python
 * GIL is released during simulation via py::gil_scoped_release.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <mutex>
#include <numeric>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace py = pybind11;

static constexpr double GRAMS_PER_METRIC_TON = 1'000'000.0;
static constexpr int DAYS_PER_YEAR = 365;

/**
 * Validate all inputs up-front. Throws std::invalid_argument (which pybind11
 * maps to Python ValueError) on bad data.
 */
static void validate_inputs(
    double initial_moer_g_co2e_per_kwh,
    double theta,
    double sigma,
    double annual_decarb_rate,
    double solar_degradation_rate_yr,
    double battery_fade_rate_yr,
    double annual_kwh,
    double solar_kwh_yr,
    double battery_kwh,
    int num_paths,
    int num_years
) {
    auto check = [](bool cond, const std::string& msg) {
        if (!cond) throw std::invalid_argument(msg);
    };
    check(!std::isnan(initial_moer_g_co2e_per_kwh) && initial_moer_g_co2e_per_kwh >= 0.0,
          "initial_moer_g_co2e_per_kwh must be >= 0 and not NaN");
    check(!std::isnan(theta) && theta >= 0.0,
          "theta must be >= 0 and not NaN");
    check(!std::isnan(sigma) && sigma >= 0.0,
          "sigma must be >= 0 and not NaN");
    check(!std::isnan(annual_decarb_rate) && annual_decarb_rate >= 0.0 && annual_decarb_rate <= 1.0,
          "annual_decarb_rate must be in [0, 1] and not NaN");
    check(!std::isnan(solar_degradation_rate_yr) && solar_degradation_rate_yr >= 0.0 && solar_degradation_rate_yr <= 1.0,
          "solar_degradation_rate_yr must be in [0, 1] and not NaN");
    check(!std::isnan(battery_fade_rate_yr) && battery_fade_rate_yr >= 0.0 && battery_fade_rate_yr <= 1.0,
          "battery_fade_rate_yr must be in [0, 1] and not NaN");
    check(!std::isnan(annual_kwh) && annual_kwh >= 0.0,
          "annual_kwh must be >= 0 and not NaN");
    check(!std::isnan(solar_kwh_yr) && solar_kwh_yr >= 0.0,
          "solar_kwh_yr must be >= 0 and not NaN");
    check(!std::isnan(battery_kwh) && battery_kwh >= 0.0,
          "battery_kwh must be >= 0 and not NaN");
    check(num_paths > 0, "num_paths must be > 0");
    check(num_years > 0 && num_years <= 50, "num_years must be in [1, 50]");
}

/**
 * Result structure returned to Python.
 */
struct SimulationResult {
    std::vector<double> yearly_median_tons;
    std::vector<double> yearly_p05_tons;
    std::vector<double> yearly_p95_tons;
    double terminal_mean_tons{0.0};
    double terminal_std_tons{0.0};
};

/**
 * Simulate a batch of paths for a given thread. Writes yearly cumulative
 * carbon offset into the provided per-year vectors.
 */
static void simulate_batch(
    int /* path_start */,
    int path_count,
    int num_years,
    double initial_moer,
    double theta,
    double sigma,
    double annual_decarb_rate,
    double solar_degradation_rate_yr,
    double battery_fade_rate_yr,
    double daily_base_kwh,
    double solar_kwh_yr,
    double battery_kwh,
    uint64_t thread_seed,
    // Output: cumulative_tons[year][path_index_within_batch]
    std::vector<std::vector<double>>& cumulative_tons
) {
    const double dt = 1.0 / static_cast<double>(DAYS_PER_YEAR);
    const double sqrt_dt = std::sqrt(dt);
    const int total_days = num_years * DAYS_PER_YEAR;

    std::mt19937_64 rng(thread_seed);
    std::normal_distribution<double> normal(0.0, 1.0);

    for (int p = 0; p < path_count; ++p) {
        double C_t = initial_moer;  // current grid carbon intensity g CO2e/kWh
        double cumulative_grams = 0.0;

        for (int d = 0; d < total_days; ++d) {
            int year = d / DAYS_PER_YEAR;
            double t_years = static_cast<double>(d) / static_cast<double>(DAYS_PER_YEAR);

            // Mean-reverting target with exponential decarbonization
            double mu_t = initial_moer * std::exp(-annual_decarb_rate * t_years);

            // OU step
            double Z = normal(rng);
            C_t = std::max(0.0, C_t + theta * (mu_t - C_t) * dt + sigma * sqrt_dt * Z);

            // Hardware degradation for this year
            double solar_factor = std::pow(1.0 - solar_degradation_rate_yr, static_cast<double>(year));
            double battery_factor = std::pow(1.0 - battery_fade_rate_yr, static_cast<double>(year));

            // Daily solar generation offset
            double daily_solar_kwh = (solar_kwh_yr / static_cast<double>(DAYS_PER_YEAR)) * solar_factor;

            // Battery enables additional load-shifting savings
            double battery_savings_fraction = (battery_kwh > 0.0)
                ? std::min(0.20 * battery_factor, 1.0)
                : 0.0;

            // Net load after solar offset
            double net_daily_kwh = std::max(0.0, daily_base_kwh - daily_solar_kwh);

            // Daily carbon: net load × grid intensity, minus battery shifting savings
            double daily_carbon_g = net_daily_kwh * C_t * (1.0 - battery_savings_fraction);
            cumulative_grams += daily_carbon_g;

            // Record at year boundaries
            if ((d + 1) % DAYS_PER_YEAR == 0) {
                cumulative_tons[year][p] = cumulative_grams / GRAMS_PER_METRIC_TON;
            }
        }
    }
}

/**
 * Run the full Monte Carlo simulation. Returns yearly percentile bands.
 */
static SimulationResult simulate_grid_decarb(
    double initial_moer_g_co2e_per_kwh,
    double theta,
    double sigma,
    double annual_decarb_rate,
    double solar_degradation_rate_yr,
    double battery_fade_rate_yr,
    double annual_kwh,
    double solar_kwh_yr,
    double battery_kwh,
    int num_paths,
    int num_years,
    uint64_t base_seed
) {
    validate_inputs(
        initial_moer_g_co2e_per_kwh, theta, sigma, annual_decarb_rate,
        solar_degradation_rate_yr, battery_fade_rate_yr,
        annual_kwh, solar_kwh_yr, battery_kwh,
        num_paths, num_years
    );

    const double daily_base_kwh = annual_kwh / static_cast<double>(DAYS_PER_YEAR);

    // Determine thread count
    int hw_threads = static_cast<int>(std::thread::hardware_concurrency());
    if (hw_threads <= 0) hw_threads = 4;
    int n_threads = std::min(hw_threads, num_paths);

    // Partition paths across threads
    std::vector<int> starts(n_threads), counts(n_threads);
    int base_count = num_paths / n_threads;
    int remainder = num_paths % n_threads;
    int offset = 0;
    for (int t = 0; t < n_threads; ++t) {
        starts[t] = offset;
        counts[t] = base_count + (t < remainder ? 1 : 0);
        offset += counts[t];
    }

    // Per-thread output: cumulative_tons[thread][year][path_within_thread]
    std::vector<std::vector<std::vector<double>>> thread_results(n_threads);
    for (int t = 0; t < n_threads; ++t) {
        thread_results[t].resize(num_years, std::vector<double>(counts[t], 0.0));
    }

    // Launch threads
    std::vector<std::thread> threads;
    threads.reserve(n_threads);
    for (int t = 0; t < n_threads; ++t) {
        threads.emplace_back(
            simulate_batch,
            starts[t], counts[t], num_years,
            initial_moer_g_co2e_per_kwh, theta, sigma, annual_decarb_rate,
            solar_degradation_rate_yr, battery_fade_rate_yr,
            daily_base_kwh, solar_kwh_yr, battery_kwh,
            base_seed + static_cast<uint64_t>(t),
            std::ref(thread_results[t])
        );
    }

    for (auto& th : threads) {
        th.join();
    }

    // Merge all paths per year
    std::vector<std::vector<double>> all_cumulative(num_years, std::vector<double>(num_paths));
    for (int t = 0; t < n_threads; ++t) {
        for (int y = 0; y < num_years; ++y) {
            std::copy(
                thread_results[t][y].begin(),
                thread_results[t][y].end(),
                all_cumulative[y].begin() + starts[t]
            );
        }
    }

    // Compute percentiles per year
    SimulationResult result;
    result.yearly_median_tons.resize(num_years);
    result.yearly_p05_tons.resize(num_years);
    result.yearly_p95_tons.resize(num_years);

    for (int y = 0; y < num_years; ++y) {
        auto& data = all_cumulative[y];
        std::sort(data.begin(), data.end());

        int idx_05 = static_cast<int>(std::round(0.05 * (num_paths - 1)));
        int idx_50 = static_cast<int>(std::round(0.50 * (num_paths - 1)));
        int idx_95 = static_cast<int>(std::round(0.95 * (num_paths - 1)));

        result.yearly_p05_tons[y] = data[idx_05];
        result.yearly_median_tons[y] = data[idx_50];
        result.yearly_p95_tons[y] = data[idx_95];
    }

    // Terminal year statistics
    const auto& term_data = all_cumulative[num_years - 1];
    double sum = std::accumulate(term_data.begin(), term_data.end(), 0.0);
    result.terminal_mean_tons = sum / static_cast<double>(num_paths);

    double sq_diff_sum = 0.0;
    for (double val : term_data) {
        double diff = val - result.terminal_mean_tons;
        sq_diff_sum += diff * diff;
    }
    result.terminal_std_tons = std::sqrt(sq_diff_sum / static_cast<double>(num_paths));

    return result;
}

PYBIND11_MODULE(fairwatt_mc_cpp, m) {
    m.doc() = "FairWatt C++ Monte Carlo grid decarbonization engine";

    py::class_<SimulationResult>(m, "SimulationResult")
        .def_readonly("yearly_median_tons", &SimulationResult::yearly_median_tons)
        .def_readonly("yearly_p05_tons", &SimulationResult::yearly_p05_tons)
        .def_readonly("yearly_p95_tons", &SimulationResult::yearly_p95_tons)
        .def_readonly("terminal_mean_tons", &SimulationResult::terminal_mean_tons)
        .def_readonly("terminal_std_tons", &SimulationResult::terminal_std_tons);

    m.def("simulate_grid_decarb",
        [](double initial_moer_g_co2e_per_kwh,
           double theta,
           double sigma,
           double annual_decarb_rate,
           double solar_degradation_rate_yr,
           double battery_fade_rate_yr,
           double annual_kwh,
           double solar_kwh_yr,
           double battery_kwh,
           int num_paths,
           int num_years,
           uint64_t base_seed) -> SimulationResult
        {
            // Release the GIL for the entire computation
            py::gil_scoped_release release;
            return simulate_grid_decarb(
                initial_moer_g_co2e_per_kwh, theta, sigma,
                annual_decarb_rate, solar_degradation_rate_yr, battery_fade_rate_yr,
                annual_kwh, solar_kwh_yr, battery_kwh,
                num_paths, num_years, base_seed
            );
        },
        py::arg("initial_moer_g_co2e_per_kwh"),
        py::arg("theta"),
        py::arg("sigma"),
        py::arg("annual_decarb_rate"),
        py::arg("solar_degradation_rate_yr"),
        py::arg("battery_fade_rate_yr"),
        py::arg("annual_kwh"),
        py::arg("solar_kwh_yr"),
        py::arg("battery_kwh"),
        py::arg("num_paths") = 10000,
        py::arg("num_years") = 20,
        py::arg("base_seed") = 20261024ULL,
        R"pbdoc(
Simulate grid carbon intensity trajectories using an Ornstein-Uhlenbeck process.

Runs num_paths Monte Carlo trajectories over num_years * 365 days.
The grid carbon intensity follows:
    C_{t+1} = max(0, C_t + theta * (mu(t) - C_t) * dt + sigma * sqrt(dt) * Z_t)
where mu(t) = initial_moer * exp(-annual_decarb_rate * t/365).

Returns a SimulationResult with yearly cumulative carbon offset percentiles.
)pbdoc"
    );
}
