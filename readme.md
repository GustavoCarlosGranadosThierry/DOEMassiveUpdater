# DOE Massive updater

## Table of contents

## Overview

This tool was designed to execute operations outside workato that represent massive tasks counts, this is a work in progress and should be updated as neccesary.

## Requirements

### Software requirements

This tool was developed using Node.JS version 20.5.0, it also uses the following packages:

"axios": "^1.4.0",
"dotenv": "^16.3.1",
"js-logger": "^1.6.1",
"node-fetch": "^3.3.1",
"prompt": "^1.3.0",
"queue-promise": "^2.2.1",
"winston": "^3.10.0".

All of which should be installed after cloning the repo jwith the command npm i

### .env file

A valid .env file is needed for the project to run, there's an example within the repo on how to set it up. You'll need to get a set of keys, one from workato and one from kevel in both environments: staging and production. Only one environment should be processed at a time per execution.

## General structure of the tool

This section should be updated when new operations are supported by the tool or the complexity/scope changes.

The system is integrated by two main files:

- index.js: the main file and the one to execute, this file containts the only operation at the moment, which is a massive update function, related to the environment established in the .env file.

- functions.js: in this file live all the functions that are needed in order to connect, manipulate and push the information between the two main systems, which are Salesforce and Kevel.

