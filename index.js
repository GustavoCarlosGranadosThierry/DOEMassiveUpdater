require('dotenv').config();
const additionalFunctions = require('./functions');
const createLogger = require('./logger');
const Queue = require('queue-promise');
const prompt = require('prompt');
const readline = require('readline');
let menu;
const mainLogger = createLogger.getLogger('massive-updater-log');
const errorLogger = createLogger.getLogger('error-massive-updater-log');
const missingTemplatesLogger = createLogger.getLogger('missing-templates-log');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function offertokevelupdate(trackerid, offerid, brandid, productid, campaignid, flightid, currentAds, isActiveL) {
    return new Promise((resolve, reject) => {
        const update = async () => {
            try {
                mainLogger.info('starting for tracker:' + trackerid);
                let envLabel = '';
                if (process.env.environment === 'staging') {
                    if (process.env.product === 'DOE') {
                        envLabel = '_staging';
                    } else if (process.env.product === 'DOE-E') {
                        envLabel = '_staging_DOE-E';
                    }
                }

                // #region Variable Declaration
                // const today = additionalFunctions.getDateSF();
                let isActive = true;
                let flightName = '';
                // const environment = '';
                let kevelwebsiteid = 0;
                let websiteName = '';
                // const geoFound = false;
                let geoInfo = '';
                let lookupValuesTranslation = '';
                let productGroup = '';
                let tcText = '';
                let brandDisplayName = '';
                let brandname = '';
                let sfStartDate = '';
                let sfEndDate = '';
                let sfEndDateCoffer = '';
                let fixedBrandURL = '';
                // #endregion

                // gets the information from salesforce
                const sfInfo = await additionalFunctions.getInformationSF(trackerid);

                // if the "No DOE ads" is disabled, the system will update the flight and offers
                if (sfInfo[0].No_DOE_ads__c === false) {
                    // gets the website id from kevel
                    kevelwebsiteid = await additionalFunctions.websiteLookup(sfInfo[0].Website__r.Name);

                    // #region variable updates
                    if (process.env.product === 'DOE') {
                        flightName = sfInfo[0].Products__r.Name + envLabel;
                    } else if (process.env.product === 'DOE-E') {
                        flightName = sfInfo[0].Commercial_Offer__r.Name + '|' + sfInfo[0].Name + '|' + sfInfo[0].Tracker_name__c + envLabel;
                    }
                    if (sfInfo[0].Remove_Geo__c == false) {
                        geoInfo = sfInfo[0].Geo__c != null ? sfInfo[0].Geo__c : sfInfo[0].Commercial_Offer__r.GEO__c;
                    }
                    websiteName = sfInfo[0].Website__r.Name;
                    if (sfInfo[0].Commercial_Offer__r.Product_Group__c != null) {
                        productGroup = sfInfo[0].Commercial_Offer__r.Product_Group__c;
                    }
                    tcText =
                    sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c != null ? sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c : sfInfo[0].Commercial_Offer__r.Offer_T_C_s_Text__c;
                    brandname = sfInfo[0].Brand__r.Name;
                    brandDisplayName = sfInfo[0].Brand_Display_Name__c != null ? sfInfo[0].Brand_Display_Name__c : sfInfo[0].Brand__r.Name;
                    sfEndDateCoffer =
                sfInfo[0].Commercial_Offer__r.Date_Time__c === true ? sfInfo[0].Commercial_Offer__r.End_Date_Time__c : sfInfo[0].Commercial_Offer__r.End_Date__c;
                    sfStartDate =
                sfInfo[0].Commercial_Offer__r.Date_Time__c === true ? sfInfo[0].Commercial_Offer__r.Start_Date_Time__c : sfInfo[0].Commercial_Offer__r.Start_Date__c;
                    // #endregion

                    // gets the translations
                    lookupValuesTranslation = await additionalFunctions.getTranslations(productGroup, geoInfo, websiteName);

                    // gets the ads ids and the templates ids used
                    const currentAdsList = await additionalFunctions.createAdsArray(currentAds);

                    // if the tracker is still active then the system
                    // will take the c-offer end date,
                    // otherwise will take the tracker end date
                    sfEndDate = sfInfo[0].Status__c === '1' ? sfEndDateCoffer : sfInfo[0].End_Date__c;
                    // with the end date the system will compare it to
                    // today, if it is null or in the future then the ad
                    // is active, otherwise it will be deactivated
                    let isADActive = await additionalFunctions.compareDates(sfEndDate);
                    // if the brand or the tracker are disabled, the ad will be too
                    // that is, if the status is 2
                    if (sfInfo[0].Status__c === '2' || sfInfo[0].Brand__r.Status__c === '2') {
                        isADActive = false;
                    }

                    // ***************************************
                    // iterates through the ads, updating them
                    // ***************************************
                    await asyncForEach(currentAdsList.currentAdsIds, async (ad) => {
                        try {
                        // gets the ad from kevel
                            const adSelected = await additionalFunctions.getAdByID(ad.ADID);
                            // gets the latest ad type
                            const templateSel = await additionalFunctions.getKevelTemplateFields(adSelected.Creative.TemplateId);
                            const ctAdtypeSel = templateSel.Fields.find((x)=> x.Variable === 'ctadtype');
                            const ctlogoSize = templateSel.Fields.find((x)=> x.Variable === 'ctlogosize');
                            if (sfInfo[0].Products__r.External_Logo_Url__c) {
                                fixedBrandURL = await additionalFunctions.transformBrandLogoUrl(sfInfo[0].Products__r.External_Logo_Url__c, ctlogoSize.Default);
                            } else {
                                fixedBrandURL = await additionalFunctions.transformBrandLogoUrl(sfInfo[0].Brand__r.External_Logo_Url__c, ctlogoSize.Default);
                            }
                            // gets the template values
                            const UBD = await additionalFunctions.unifiedBrandDataUpdate(
                                offerid,
                                brandid,
                                trackerid,
                                adSelected.Creative.AdvertiserId,
                                adSelected.Creative.TemplateId,
                                adSelected.Creative.Id,
                                ctAdtypeSel.Default,
                                adSelected.Creative.Metadata,
                                productid,
                                websiteName,
                                sfInfo[0].Commercial_Offer__r.Product_Name_Text__c,
                                sfInfo[0].Commercial_Offer__r.Name,
                                sfInfo[0].Name,
                                sfInfo[0].Tracker_name__c,
                                sfInfo[0].Commercial_Offer__r.Promo_Code_Bonus_Code__c,
                                sfInfo[0].Brand__r.Brand_Rating__c,
                                tcText,
                                sfInfo[0].Review_URL__c,
                                sfInfo[0].Primary_Tracker__c,
                                sfInfo[0].Commercial_Offer__r.Bonus_Type__c,
                                sfInfo[0].Commercial_Offer__r.Product_Group__c,
                                fixedBrandURL,
                                brandname,
                                geoInfo,
                                lookupValuesTranslation,
                                brandDisplayName,
                            );
                            // updates the creative
                            await additionalFunctions.updateCreative(
                                adSelected.Creative.Id,
                                adSelected.Creative.AdvertiserId,
                                UBD.title,
                                ctAdtypeSel.Default,
                                adSelected.Creative.Url,
                                adSelected.Creative.TemplateId,
                                UBD.template_values,
                                UBD.metadata,
                            );
                            mainLogger.info(`Creative updated, id: ${adSelected.Creative.Id} , flight id: ${flightid}`);
                            mainLogger.info(`template values for creative ${adSelected.Creative.Id}: ${UBD.template_values}`);
                            // calls the ad update
                            await additionalFunctions.updateAd(
                                flightid,
                                adSelected.Id,
                                adSelected.Creative.Id,
                                isADActive,
                                kevelwebsiteid,
                                sfStartDate,
                                sfEndDate,
                            );
                            mainLogger.info(`ad updated, id: ${adSelected.Id} , creative id: ${adSelected.Creative.Id} , flight id: ${flightid}`);
                        } catch (e) {
                            errorLogger.info('Error updating ad:' + ad + ', error:' + e);
                        }
                    });

                    // ***************************************
                    // updates the geo for the current flight
                    // ***************************************

                    // if there's valid information for the geo and
                    // the geo is active on the tracker then we
                    // recreate the geo information

                    if (process.env.product === 'DOE') {
                        const validateGeoRemoval = await additionalFunctions.flightSearchGeoCreation(flightid);
                        if (geoInfo != '' && validateGeoRemoval == false) {
                            try {
                                const countryRegionName = await additionalFunctions.splitCountryRegion(geoInfo);
                                await additionalFunctions.geoForFlights(
                                    flightid,
                                    countryRegionName.country,
                                    countryRegionName.region,
                                    sfInfo[0].Remove_Geo__c,
                                );
                                flightName = sfInfo[0].Products__r.Name + ' ' + countryRegionName.country + envLabel;
                                mainLogger.info('Geo updated for flight: ' + flightid);
                            } catch (errorGeo) {
                                errorLogger.info('Error updating geo for flight: ' + flightid + ', error: ' + errorGeo);
                            }
                        } else if (validateGeoRemoval == true) {
                        // if at least one tracker has the no geo, the geo gets removed from the whole flight
                            await additionalFunctions.geoForFlights(
                                flightid,
                                '',
                                '',
                                validateGeoRemoval,
                            );
                            flightName = sfInfo[0].Products__r.Name + ' ' + '' + envLabel;
                            mainLogger.info('Geo removed for flight: ' + flightid);
                        }
                    } else if (process.env.product === 'DOE-E') {
                        try {
                            await additionalFunctions.geoForFlightsDOEE(flightid, geoInfo, sfInfo[0].Remove_Geo__c);
                            mainLogger.info('Geo updated for flight: ' + flightid);
                        } catch (errorGeo) {
                            errorLogger.info('Error updating geo for flight: ' + flightid + ', error: ' + errorGeo);
                        }
                    }

                    // ***************************************
                    // updates the flight, activating, deactivating it
                    // and updates the flight name with the latest geo
                    // ***************************************

                    // checks if all the ads from the flight are inactive
                    // if they are it returns a false, otherwise returns a true

                    try {
                        const getAds = await additionalFunctions.getAdsByFlight(flightid);
                        isActive = await additionalFunctions.checkAdsInsideFlight(getAds.items);

                        // calls the update function
                        await additionalFunctions.updateFlight(flightName, flightid, isActive);
                        mainLogger.info('Flight updated:' + flightid);
                        // DOE-E will refresh the campaign name with the latest c-offer name
                        if (process.env.product === 'DOE-E') {
                            await additionalFunctions.updateCampaign(sfInfo[0].Commercial_Offer__r.Name, campaignid);
                            mainLogger.info('Campaign updated: ' + campaignid);
                        }
                    } catch (errorFlight) {
                        errorLogger.info('Error updating flight:' + errorFlight);
                    }

                    mainLogger.info('end of tracker:' + trackerid);
                    return resolve('ok');
                } else {
                    // scenario where the user selected the "No DOE ads" option in SF but offers were created,
                    // the system will disable the flight and the offers

                    // logs the operation
                    mainLogger.info(`flight found to be marked as "No DOE ad", flight id: ${flightid}`);

                    // gets the ads ids and the templates ids used
                    const currentAdsList = await additionalFunctions.createAdsArray(currentAds);
                    // gets the website id from kevel
                    kevelwebsiteid = await additionalFunctions.websiteLookup(sfInfo[0].Website__r.Name);
                    // gets today's date
                    const today = await additionalFunctions.getDateSF();

                    // ***************************************
                    // iterates through the ads, disabling them
                    // ***************************************
                    await asyncForEach(currentAdsList.currentAdsIds, async (ad) => {
                        try {
                            // gets the ad from kevel
                            const adSelected = await additionalFunctions.getAdByID(ad.ADID);
                            // calls the ad update
                            await additionalFunctions.updateAd(
                                flightid,
                                adSelected.Id,
                                adSelected.Creative.Id,
                                false,
                                kevelwebsiteid,
                                adSelected.StartDateISO,
                                today,
                            );
                            mainLogger.info(`ad disabled, id: ${adSelected.Id} , creative id: ${adSelected.Creative.Id} , flight id: ${flightid}`);
                        } catch (e) {
                            errorLogger.info('Error updating ad:' + ad + ', error:' + e);
                        }
                    });

                    // gets the flight by id
                    const currentFlight = await additionalFunctions.getFlightByID(flightid);
                    // calls the update function for the flight, disabling it
                    await additionalFunctions.updateFlight(currentFlight.Name, flightid, false);
                    mainLogger.info('Flight disabled:' + flightid);
                    mainLogger.info('end of tracker:' + trackerid);
                    return resolve('ok');
                }
                // remove these
                mainLogger.info('end of tracker:' + trackerid);
                return resolve('ok');
            } catch (eInfo) {
                errorLogger.info('error in main offer to kevel update:' + eInfo + ', tracker id:' + trackerid);
                return resolve(new Error('error while bringing data'));
            }
        };
        update();
    });
}

async function createMissingTemplatesFunction(lookuptableID, trackerid, offerid, brandid, productid, campaignid, flightid, currentAds, isActiveL,
    templateList, templateCount) {
    return new Promise((resolve, reject) => {
        const update = async () => {
            try {
                missingTemplatesLogger.info(`Lookup table record id: ${lookuptableID}`);
                // gets the ads ids and the templates ids used
                const currentAdsList = await additionalFunctions.createAdsArray(currentAds);
                // validation, if they are the same (ads and templates): everything is ok, otherwise is a big error
                const currentAdsCount = currentAdsList.currentAdsIds.length === currentAdsList.currentTemplatesIds.length ?
                    currentAdsList.currentAdsIds.length : 0;
                if (currentAdsCount === 0) {
                    errorLogger.info('This is probably broken: ads and ids dont match for tracker:' + trackerid);
                    return reject(new Error('This is probably broken: ads and ids dont match for tracker:' + trackerid));
                }
                // validate the number of current ads vs the current number of templates in Kevel
                // if they are not equal then the process starts ONLY if the number of current ads is less than the templates
                if (currentAdsCount === templateCount) {
                    missingTemplatesLogger.info('tracker:' + trackerid + ' has the correct number of templates');
                } else {
                    // first scenario, possible duplicate, we report it and stops the process
                    if (currentAdsCount > templateCount) {
                        errorLogger.info('This tracker:' + trackerid + ' has more ads, possible duplication');
                        return reject(new Error('This tracker:' + trackerid + ' has more ads, possible duplication'));
                    } else {
                        // starts the whole process
                        missingTemplatesLogger.info('tracker:' + trackerid + ' has less ads, commencing operation');
                        let envLabel = '';
                        if (process.env.environment === 'staging') {
                            if (process.env.product === 'DOE') {
                                envLabel = '_staging';
                            } else if (process.env.product === 'DOE-E') {
                                envLabel = '_staging_DOE-E';
                            }
                        }

                        // #region Variable Declaration
                        let isActive = true;
                        let updatedAdList = currentAds;
                        let flightName = '';
                        // const environment = '';
                        let kevelwebsiteid = 0;
                        let websiteName = '';
                        // const geoFound = false;
                        let geoInfo = '';
                        let lookupValuesTranslation = '';
                        let productGroup = '';
                        let tcText = '';
                        let brandDisplayName = '';
                        let brandname = '';
                        let sfStartDate = '';
                        let sfEndDate = '';
                        let sfEndDateCoffer = '';
                        let fixedBrandURL = '';
                        // #endregion

                        // gets the information from salesforce
                        const sfInfo = await additionalFunctions.getInformationSF(trackerid);
                        // gets the website id from kevel
                        kevelwebsiteid = await additionalFunctions.websiteLookup(sfInfo[0].Website__r.Name);
                        // looks for the advertiser in Kevel, if not found it will crash
                        const advertiser = await additionalFunctions.advertiserLookup(sfInfo[0].Brand__r.Name);

                        // #region variable updates
                        if (process.env.product === 'DOE') {
                            flightName = sfInfo[0].Products__r.Name + envLabel;
                        } else if (process.env.product === 'DOE-E') {
                            flightName = sfInfo[0].Commercial_Offer__r.Name + '|' + sfInfo[0].Name + '|' + sfInfo[0].Tracker_name__c + envLabel;
                        }
                        if (sfInfo[0].Remove_Geo__c == false) {
                            geoInfo = sfInfo[0].Geo__c != null ? sfInfo[0].Geo__c : sfInfo[0].Commercial_Offer__r.GEO__c;
                        }
                        websiteName = sfInfo[0].Website__r.Name;
                        if (sfInfo[0].Commercial_Offer__r.Product_Group__c != null) {
                            productGroup = sfInfo[0].Commercial_Offer__r.Product_Group__c;
                        }
                        tcText =
                    sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c != null ? sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c : sfInfo[0].Commercial_Offer__r.Offer_T_C_s_Text__c;
                        brandname = sfInfo[0].Brand__r.Name;
                        brandDisplayName = sfInfo[0].Brand_Display_Name__c != null ? sfInfo[0].Brand_Display_Name__c : sfInfo[0].Brand__r.Name;
                        sfEndDateCoffer =
                sfInfo[0].Commercial_Offer__r.Date_Time__c === true ? sfInfo[0].Commercial_Offer__r.End_Date_Time__c : sfInfo[0].Commercial_Offer__r.End_Date__c;
                        sfStartDate =
                sfInfo[0].Commercial_Offer__r.Date_Time__c === true ? sfInfo[0].Commercial_Offer__r.Start_Date_Time__c : sfInfo[0].Commercial_Offer__r.Start_Date__c;

                        // if the tracker is still active then the system
                        // will take the c-offer end date,
                        // otherwise will take the tracker end date
                        sfEndDate = sfInfo[0].Status__c === '1' ? sfEndDateCoffer : sfInfo[0].End_Date__c;
                        // with the end date the system will compare it to
                        // today, if it is null or in the future then the ad
                        // is active, otherwise it will be deactivated
                        let isADActive = await additionalFunctions.compareDates(sfEndDate);
                        // if the brand or the tracker are disabled, the ad will be too
                        // that is, if the status is 2
                        if (sfInfo[0].Status__c === '2' || sfInfo[0].Brand__r.Status__c === '2') {
                            isADActive = false;
                        }
                        // #endregion

                        // gets the translations
                        lookupValuesTranslation = await additionalFunctions.getTranslations(productGroup, geoInfo, websiteName);

                        // gets the branding colors
                        const templateCommaList = await additionalFunctions.createCommaSeparatedTemplateList(templateList);
                        const brandColors = await additionalFunctions.getBrandColors(sfInfo[0].Website__r.Name, templateCommaList, brandid);

                        // gets the number of templates to be filled
                        // for debugging purposes they should be two for the first use, after that this thing should be removed
                        // limits the results to only two
                        const missingTemplatesIDs = await additionalFunctions.returnMissingTemplatesIdsFromFlight(
                            currentAdsList.currentTemplatesIds, templateList);


                        if (missingTemplatesIDs.length > 4) {
                            errorLogger.info('Failsafe activated, probably a duplicate operation for tracker:' + trackerid);
                            return reject(new Error('Failsafe activated, probably a duplicate operation for tracker:' + trackerid));
                        }

                        // ***************************************
                        // iterates through the missing elements
                        // ***************************************
                        await asyncForEach(missingTemplatesIDs, async (templateIteration) => {
                            try {
                                // gets the latest ad type
                                const templateSel = await additionalFunctions.getKevelTemplateFields(templateIteration);
                                const ctAdtypeSel = templateSel.Fields.find((x)=> x.Variable === 'ctadtype');
                                const ctlogoSize = templateSel.Fields.find((x)=> x.Variable === 'ctlogosize');
                                if (sfInfo[0].Products__r.External_Logo_Url__c) {
                                    fixedBrandURL = await additionalFunctions.transformBrandLogoUrl(sfInfo[0].Products__r.External_Logo_Url__c, ctlogoSize.Default);
                                } else {
                                    fixedBrandURL = await additionalFunctions.transformBrandLogoUrl(sfInfo[0].Brand__r.External_Logo_Url__c, ctlogoSize.Default);
                                }
                                // gets the template values
                                const UBD = await additionalFunctions.unifiedBrandDataCreate(
                                    offerid,
                                    brandid,
                                    trackerid,
                                    advertiser.Id,
                                    templateIteration,
                                    0,
                                    ctAdtypeSel.Default,
                                    '',
                                    productid,
                                    websiteName,
                                    sfInfo[0].Commercial_Offer__r.Product_Name_Text__c,
                                    sfInfo[0].Commercial_Offer__r.Name,
                                    sfInfo[0].Name,
                                    sfInfo[0].Tracker_name__c,
                                    sfInfo[0].Commercial_Offer__r.Promo_Code_Bonus_Code__c,
                                    sfInfo[0].Brand__r.Brand_Rating__c,
                                    tcText,
                                    sfInfo[0].Review_URL__c,
                                    sfInfo[0].Primary_Tracker__c,
                                    sfInfo[0].Commercial_Offer__r.Bonus_Type__c,
                                    sfInfo[0].Commercial_Offer__r.Product_Group__c,
                                    fixedBrandURL,
                                    brandname,
                                    geoInfo,
                                    lookupValuesTranslation,
                                    brandDisplayName,
                                    brandColors,
                                );

                                // creates the tracking link
                                const trackingLink = 'https://ts.xlmedia.com/clickout/redirect?tracker_id=' + sfInfo[0].Name;

                                // creates the creative
                                const creativeCreation = await additionalFunctions.createCreative(advertiser.Id,
                                    ctAdtypeSel.Default, UBD.title, isADActive, trackingLink, templateIteration,
                                    UBD.template_values, UBD.metadata);

                                missingTemplatesLogger.info(`Creative created, id: ${creativeCreation.Id} , flight id: ${flightid}`);
                                missingTemplatesLogger.info(`template values for creative ${creativeCreation.Id}: ${UBD.template_values}`);
                                // calls the ad creation
                                const adCreated = await additionalFunctions.createAd(
                                    flightid,
                                    0,
                                    creativeCreation.Id,
                                    isADActive,
                                    kevelwebsiteid,
                                    sfStartDate,
                                    sfEndDate,
                                );
                                missingTemplatesLogger.info(`ad created, id: ${adCreated.Id} , creative id: ${creativeCreation.Id} , flight id: ${flightid}`);
                                updatedAdList += '|' + adCreated.Id + ';' + templateIteration;
                            } catch (e) {
                                errorLogger.info('Error updating ad:' + ad + ', error:' + e);
                            }
                        });

                        // updates the lookup table in Workato
                        await additionalFunctions.updateLookupTableWorkato(lookuptableID, updatedAdList);
                        missingTemplatesLogger.info(`Automatic Lookup table updated in Workato, id: ${lookuptableID} , flight id: ${flightid}`);
                        // end of the whole process
                    }
                }
                mainLogger.info('end of tracker:' + trackerid);
                return resolve('ok');
            } catch (eInfo) {
                errorLogger.info('error in Main Iteration for creating missing templates:' + eInfo + ', tracker id:' + trackerid);
                return resolve(new Error('error'));
            }
        };
        update();
    });
}

async function performMassiveUpdate() {
    mainLogger.info('Starting massive update');
    try {
        // creates the queue
        const queue = new Queue({
            concurrent: 5,
            interval: 2000,
            start: false,
        });

        // User confirm the modify operation
        let options = '\nYou are going to use the massive updater using the following configuration: \n\t';
        Object.keys(additionalFunctions.config).forEach((key) => {
            options += `- ${key}: ${additionalFunctions.config[key]}
         `;
        });
        options += '\nthis cannot be undone, proceed? (yes/no)';

        prompt.start();
        const confirm = await prompt.get({
            properties: {
                confirm: {
                    description: options,
                    pattern: /^(?:yes|no)$/,
                },
            },
        });
        if (confirm.confirm && confirm.confirm === 'no') {
            mainLogger.info('Operation canceled by the user');
            return;
        }

        AlookupTable = await additionalFunctions.getAutomaticLookupTable();
        const start = async () => {
            // iterate through the trackers on the lookup table
            try {
                mainLogger.info('Lookup table size:' + AlookupTable.length);
                await asyncForEach(AlookupTable, async (automaticElement) => {
                    queue.enqueue(async () => {
                        return offertokevelupdate(
                            automaticElement.entry.col1,
                            automaticElement.entry.col2,
                            automaticElement.entry.col3,
                            automaticElement.entry.col4,
                            automaticElement.entry.col5,
                            automaticElement.entry.col6,
                            automaticElement.entry.col7,
                            automaticElement.entry.col9,
                        );
                    });
                });
            } catch (err) {
                errorLogger.info('Error in main:' + err);
            }
        };

        // starts the whole process, the lookup table iteration
        start();

        mainLogger.info('Starting Queue');
        while (queue.shouldRun) {
            try {
                await queue.dequeue();
            } catch (error) {
                errorLogger.info('error within queue:' + error);
            }
        }
    } catch (errorMain) {
        // the process stops, logs the error
        errorLogger.info('Error in Main massive update function:' + errorMain);
    }
}

async function getDebbugingReport() {
    // User confirm the modify operation
    let options = 'A folder named logs should exist within the root of this project in order to avoid any error\n\nConfirm the report generation (yes/no)';

    options += '\n\nIF YOU SEE THE SYSTEM IDLE that means is still working :) just need to implement a progress bar or something, the system will notify when is done';

    prompt.start();
    const confirm = await prompt.get({
        properties: {
            confirm: {
                description: options,
                pattern: /^(?:yes|no)$/,
            },
        },
    });

    if (confirm.confirm && confirm.confirm === 'no') {
        mainLogger.info('Operation canceled by the user');
        return;
    }

    await additionalFunctions.checkFlightsPerCampaign();
    console.log('Report Generated successfully, the report can be found under the logs folder > massive-reporter-flights-log file');
}

const main = async () => {
    // main menu log 3 = Perform a targeted massive update (by tracker, c-offer,brand or product SF id)\n' +
    console.log(
        '\nDOE-E Massive Updater main menu\n\nThe tool is pointing currently to:' + process.env.environment + '\n\n' +
    '1 = Perform a massive update\n' +
    '2 = Get debugging report (missing templates,empty flights, possible duplicates)\n' +
    '3 = Perform a targeted operation (update or create)\n' +
    '4 = Create missing offers (new templates added to the system)\n' +
    '5 = Exit',
    );

    // if there's a menu it closes it
    if (menu) menu.close();

    // readline declaration
    menu = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // start the menu
    menu.question('Select the option: ', async function(input) {
        menu.close();
        switch (input) {
        case '1': await performMassiveUpdate(); break;
        case '2': getDebbugingReport(); break;
        case '3': subMenuTargetedOperation(); break;
        case '4': subMenuCreateMissingOffers(); break;
        case '5': process.exit(); break;
        default: main();
        }
    });
};

const subMenuTargetedOperation = async () => {
    // main menu log
    console.log(
        '\nWhich operation do you want?\n\nThe tool is pointing currently to:' + process.env.environment + '\n\n' +
'1 = Update\n' +
'2 = Create\n' +
'3 = Exit',
    );

    // if there's a menu it closes it
    if (menu) menu.close();

    // readline declaration
    menu = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // start the menu
    menu.question('Select the option: ', async function(input) {
        menu.close();
        switch (input) {
        case '1': subMenuTargetedUpdate(); break;
        case '2': subMenuTargetedCreate(); break;
        case '3': process.exit(); break;
        default: subMenuTargetedOperation();
        }
    });
};

const subConfirmTargetedUpdate = async (selectedOption) => {
    // User confirm the modify operation
    let options = 'Insert the SF ID for the desired selection: ' + selectedOption;

    prompt.start();
    let confirm = await prompt.get({
        properties: {
            confirm: {
                description: options,
            },
        },
    });

    if (!confirm.confirm) {
        mainLogger.info('You entered an empty value, Operation canceled by the user');
        return;
    }

    const sfID = confirm.confirm;

    // User confirm the modify operation
    options = '\nYou are going to use the massive updater using the following configuration:\n\t';
    Object.keys(additionalFunctions.config).forEach((key) => {
        options += `- ${key}: ${additionalFunctions.config[key]}
     `;
    });
    options += `\n\nSelected SF ID: ${sfID}\nSelected option:${selectedOption}\n\nthis cannot be undone, proceed? (yes/no)`;

    prompt.start();
    confirm = await prompt.get({
        properties: {
            confirm: {
                description: options,
                pattern: /^(?:yes|no)$/,
            },
        },
    });
    if (confirm.confirm && confirm.confirm === 'no') {
        mainLogger.info('Operation canceled by the user');
        return;
    }

    // creates the queue
    const queue = new Queue({
        concurrent: 5,
        interval: 2000,
        start: false,
    });

    // starts the process
    try {
        AlookupTable = await additionalFunctions.getAutomaticLookupTable(selectedOption, sfID);
        const start = async () => {
            // iterate through the objects on the lookup table
            try {
                mainLogger.info('Lookup table size: ' + AlookupTable.length);
                await asyncForEach(AlookupTable, async (automaticElement) => {
                    queue.enqueue(async () => {
                        return offertokevelupdate(
                            automaticElement.entry.col1,
                            automaticElement.entry.col2,
                            automaticElement.entry.col3,
                            automaticElement.entry.col4,
                            automaticElement.entry.col5,
                            automaticElement.entry.col6,
                            automaticElement.entry.col7,
                            automaticElement.entry.col9,
                        );
                    });
                });
            } catch (err) {
                errorLogger.info('Error in main:' + err);
            }
        };

        // starts the whole process, the lookup table iteration
        start();

        mainLogger.info('Starting Queue');
        while (queue.shouldRun) {
            try {
                await queue.dequeue();
            } catch (error) {
                errorLogger.info('error within queue:' + error);
            }
        }
    } catch (errorMain) {
        // the process stops, logs the error
        errorLogger.info('Error in Main massive update function:' + errorMain);
    }
};

const subMenuTargetedUpdate = async () => {
    // main menu log
    console.log(
        '\nWhich will be the data to be updated in DOE-E\n\nThe tool is pointing currently to:' + process.env.environment + '\n\n' +
'1 = Tracker\n' +
'2 = C-Offer\n' +
'3 = Brand\n' +
'4 = Product\n' +
'5 = Exit',
    );

    // if there's a menu it closes it
    if (menu) menu.close();

    // readline declaration
    menu = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // start the menu
    menu.question('Select the option: ', async function(input) {
        menu.close();
        switch (input) {
        case '1': subConfirmTargetedUpdate('tracker'); break;
        case '2': subConfirmTargetedUpdate('coffer'); break;
        case '3': subConfirmTargetedUpdate('brand'); break;
        case '4': subConfirmTargetedUpdate('product'); break;
        case '5': process.exit(); break;
        default: subMenuTargetedUpdate();
        }
    });
};

const subConfirmTargetedCreate = async (selectedOption) => {
    // User confirm the modify operation
    let options = 'Insert the SF ID for the desired selection: ' + selectedOption;

    prompt.start();
    let confirm = await prompt.get({
        properties: {
            confirm: {
                description: options,
            },
        },
    });

    if (!confirm.confirm) {
        missingTemplatesLogger.info('You entered an empty value, Operation canceled by the user');
        return;
    }

    const sfID = confirm.confirm;

    // User confirm the modify operation
    options = '\nYou are going to use the massive updater to CREATE MISSING TEMPLATES using the following configuration:\n\t';
    Object.keys(additionalFunctions.config).forEach((key) => {
        options += `- ${key}: ${additionalFunctions.config[key]}
     `;
    });
    options += `\n\nSelected SF ID: ${sfID}\nSelected option:${selectedOption}\n\nthis cannot be undone, proceed? (yes/no)`;

    prompt.start();
    confirm = await prompt.get({
        properties: {
            confirm: {
                description: options,
                pattern: /^(?:yes|no)$/,
            },
        },
    });
    if (confirm.confirm && confirm.confirm === 'no') {
        missingTemplatesLogger.info('Operation canceled by the user');
        return;
    }

    // creates the queue
    const queue = new Queue({
        concurrent: 5,
        interval: 2000,
        start: false,
    });

    // gets the template list from Kevel
    const templateList = await additionalFunctions.getKevelTemplatesCount(2);
    // gets the template list count
    const templateListCount = await additionalFunctions.getKevelTemplatesCount();

    // starts the process
    try {
        AlookupTable = await additionalFunctions.getAutomaticLookupTable(selectedOption, sfID);
        const start = async () => {
            // iterate through the objects on the lookup table
            try {
                missingTemplatesLogger.info('Lookup table size:' + AlookupTable.length);
                await asyncForEach(AlookupTable, async (automaticElement) => {
                    queue.enqueue(async () => {
                        return createMissingTemplatesFunction(
                            automaticElement.id,
                            automaticElement.entry.col1,
                            automaticElement.entry.col2,
                            automaticElement.entry.col3,
                            automaticElement.entry.col4,
                            automaticElement.entry.col5,
                            automaticElement.entry.col6,
                            automaticElement.entry.col7,
                            automaticElement.entry.col9,
                            templateList,
                            templateListCount,
                        );
                    });
                });
            } catch (err) {
                errorLogger.info('Error in main:' + err);
            }
        };

        // starts the whole process, the lookup table iteration
        start();

        mainLogger.info('Starting Queue');
        while (queue.shouldRun) {
            try {
                await queue.dequeue();
            } catch (error) {
                errorLogger.info('error within queue:' + error);
            }
        }
    } catch (errorMain) {
        // the process stops, logs the error
        errorLogger.info('Error in Targeted creation function:' + errorMain);
    }
};

const subMenuTargetedCreate = async () => {
    // main menu log
    console.log(
        '\nWhich will be used to identify the missing Templates\n\nThe tool is pointing currently to:' + process.env.environment + '\n\n' +
'1 = Tracker\n' +
'2 = C-Offer\n' +
'3 = Brand\n' +
'4 = Product\n' +
'5 = Exit',
    );

    // if there's a menu it closes it
    if (menu) menu.close();

    // readline declaration
    menu = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // start the menu
    menu.question('Select the option: ', async function(input) {
        menu.close();
        switch (input) {
        case '1': subConfirmTargetedCreate('tracker'); break;
        case '2': subConfirmTargetedCreate('coffer'); break;
        case '3': subConfirmTargetedCreate('brand'); break;
        case '4': subConfirmTargetedCreate('product'); break;
        case '5': process.exit(); break;
        default: subConfirmTargetedCreate();
        }
    });
};

const subMenuCreateMissingOffers = async () => {
    missingTemplatesLogger.info('Starting missing templates process');
    try {
        // creates the queue
        const queue = new Queue({
            concurrent: 5,
            interval: 2000,
            start: false,
        });
        // gets the template list from Kevel
        const templateList = await additionalFunctions.getKevelTemplatesCount(2);
        // gets the template list count
        const templateListCount = await additionalFunctions.getKevelTemplatesCount();
        // User confirm the operation
        let options = '\nTemplates registered in the system are the following: \n\t';
        templateList.items.forEach((template) => options += `- ${template.Name}
        `);
        options += '\n\nThe system will check all the flights in the system and determine which ones are missing one or more of these templates and create them';
        options += '\nthis cannot be undone, proceed? (yes/no)';

        prompt.start();
        const confirm = await prompt.get({
            properties: {
                confirm: {
                    description: options,
                    pattern: /^(?:yes|no)$/,
                },
            },
        });
        if (confirm.confirm && confirm.confirm === 'no') {
            missingTemplatesLogger.info('Operation canceled by the user');
            return;
        }

        AlookupTable = await additionalFunctions.getAutomaticLookupTable();
        const start = async () => {
            // iterate through the trackers on the lookup table
            try {
                missingTemplatesLogger.info('Lookup table size:' + AlookupTable.length);
                await asyncForEach(AlookupTable, async (automaticElement) => {
                    queue.enqueue(async () => {
                        return createMissingTemplatesFunction(
                            automaticElement.id,
                            automaticElement.entry.col1,
                            automaticElement.entry.col2,
                            automaticElement.entry.col3,
                            automaticElement.entry.col4,
                            automaticElement.entry.col5,
                            automaticElement.entry.col6,
                            automaticElement.entry.col7,
                            automaticElement.entry.col9,
                            templateList,
                            templateListCount,
                        );
                    });
                });
            } catch (err) {
                errorLogger.info('Error in main missing offers async:' + err);
            }
        };

        // starts the whole process, the lookup table iteration
        start();

        mainLogger.info('Starting Queue');
        while (queue.shouldRun) {
            try {
                await queue.dequeue();
            } catch (error) {
                errorLogger.info('error within queue missing offers async:' + error);
            }
        }
    } catch (errorMain) {
        // the process stops, logs the error
        errorLogger.info('Error in Main Missing templates function:' + errorMain);
    }
};

main();
