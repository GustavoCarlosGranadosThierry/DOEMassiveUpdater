# DOE Massive updater

- [DOE Massive updater](#doe-massive-updater)
  - [Overview](#overview)
  - [Requirements](#requirements)
    - [Software requirements](#software-requirements)
    - [.env file](#env-file)
  - [General structure of the tool](#general-structure-of-the-tool)
  - [Tool Usage](#tool-usage)
    - [Perform a massive update](#perform-a-massive-update)
      - [Target a specific site for massive updates](#target-a-specific-site-for-massive-updates)
    - [Get debugging report](#get-debugging-report)
    - [Perform a targeted massive update](#perform-a-targeted-massive-update)
    - [Create missing offers](#create-missing-offers)

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

- index.js: the main file and the one to execute, this file controls the general flow of the system, has the main logic to perform the step-by-step update of the offers and uses the functions within the functions.js file in order to reduce the complexity of the file.

- functions.js: in this file live all the functions that are needed in order to connect, manipulate and push the information between the two main systems, which are Salesforce and Kevel.

## Tool Usage

To execute the system we use the "npm start" command, the system will prompt us what option do we want to execute, these options are:

### Perform a massive update

This will update all the offers within the network, before executing this option, you need to make sure that the env file is pointing at the environment you desire to work with.

#### Target a specific site for massive updates

The system has the option to make an update only in a specific site, for this, you need to specify the website in the functions.js file, inside the config JSON there's a property called site, it can take these two values, if the value is '' then the system will take all the records within the lookup table in Workato (DOE_E_Automatic_log), updating all the networkk. If you want to target a site it has to have the exact same value that is stored in the lookup table in the site column of the previous mentioned lookup table, an example would be 'freebets.com', if the site property is empty, the system will crash so make sure that the default value is always ''.

### Get debugging report

This function will generate a report within the logs folder inside the root of the project (make sure the folder exists), the system will check all the network established in the env file for these cases: empty flights, missing templates within flights and possible duplicates within a flight.

### Perform a targeted massive update

Whenever you want to update a specific tracker, brand, c-offer or product, you can use this option, this is useful for multiple scenarios, whenever you want to test a new functionality, debug, massive update only one set of records, etc. The way it works is: you select the option to update (tracker, c-offer, brand or product), you'll be requested for the salesforce ID of the element to update, after that the system will prompt you to confirm the operation, you can do the targeted website selection previously explanined on the 'Target a specific site for massive updates' by entering the website if that's what you need.

### Create missing offers

This is still under construction.
