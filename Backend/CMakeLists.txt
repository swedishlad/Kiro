cmake_minimum_required(VERSION 3.15)
project(fairwatt_mc_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(pybind11 REQUIRED)

pybind11_add_module(fairwatt_mc_cpp cpp/climate_mc.cpp)

target_compile_options(fairwatt_mc_cpp PRIVATE
    -O3
    -Wall
    -Wextra
    -Wpedantic
    -march=native
)

install(TARGETS fairwatt_mc_cpp DESTINATION .)
