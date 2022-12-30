# About

This project is a [VSCode extension](https://marketplace.visualstudio.com/items?itemName=crugthew.c-cpp-linter) which provides linting for C/C++ source files. The goal is to provide linting for source files at the click of a button. That's it.

![Preview](https://github.com/crugthew/vscode-c-cpp-linter/raw/master/images/preview.jpg "Preview")

This extension simply runs the configured tools either on file open and save events or at the explicit user request and shows the linting information in VSCode. This is by design.

This extension aims to be:
* Easily extendable for other linting information providers;
* Working with minimal additional project configuration;

As of this release the extension can be used to gather linting information from these providers:
* Compiler ([GCC](http://gcc.gnu.org), [clang](http://clang.llvm.org), ...)
* [Clang-Tidy](http://clang.llvm.org/extra/clang-tidy)
* [CppCheck](http://cppcheck.net)

## Requirements

For the extension to be useful at least one of the above mentioned linting providers must be installed on the host system.

The extension expects the project to provide a `compile_commands.json` file in an appropriate format. The default location where the file is to located is `${workspaceFolder}/build/compile_commands.json`. This can be changed by the `c-cpp-linter.buildFolderPath` setting.

## Configuration

Each tool can be configured separately. Please refer to the contributions section of this extension.

## Environment

The extension was written and tested under Linux. It should work under Windows as well, though I can not check it myself at this time.

## "It's not working!"...

Please refer to the output tab and check the logs for the extension. Most likely you either don't have any tools installed or `compile_commands.json` can't be found.
