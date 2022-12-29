# About

This extension provides linting for C/C++ files. it was written because other similar extensions which provide linting for C/C++ projects did not meet the users expectations or were not configurable enough.

This extension aims to be:
* Easily extendable for other linting information providers;
* Working with minimal additional project configuration;

This extension simply runs the configured tools and shows the linting information in VSCode. This is by design.

As of this release the extension can be used to gather linting information from these providers:
* Compiler ([GCC](http://gcc.gnu.org), [clang](http://clang.llvm.org), ...)
* [Clang-Tidy](http://clang.llvm.org/extra/clang-tidy)
* [CppCheck](http://cppcheck.net)

> Note: Each linting information provider can be configured separately. Please check extension contributions section for options.

## Requirements

For the extension to be useful at least one of the above mentioned linting providers must be installed on the host system.

The extension expects the project to provide a `compile_commands.json` file in an appropriate format.

## Environment

The extension was written and tested under Linux. It should work under Windows as well, though I can not check it myself at this time.
