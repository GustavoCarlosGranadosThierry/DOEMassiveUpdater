/* eslint-disable require-jsdoc */
require('dotenv').config();
const additionalFunctions = require('./functions');
const createLogger = require('./logger');
const Queue = require('queue-promise');
const prompt = require('prompt');

const mainLogger = createLogger.getLogger('massive-updater-log');
const errorLogger = createLogger.getLogger('error-massive-updater-log');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function offertokevelupdate(trackerid, offerid, brandid, productid,
    campaignid, flightid, currentAds, isActiveL ) {
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
                let environment = '';
                let kevelwebsiteid = 0;
                let websiteName = '';
                let geoFound = false;
                let geoInfo = '';
                let lookupValuesTranslation = '';
                let productGroup = '';
                let tcText = '';
                let brandDisplayName = '';
                let brandname = '';
                let sfEndDate = '';
                // #endregion

                // gets the information from salesforce
                const sfInfo = await
                additionalFunctions.getInformationSF(trackerid);

                // gets the website id from kevel
                kevelwebsiteid = await
                additionalFunctions.websiteLookup(sfInfo[0].Website__r.Name);

                // #region variable updates
                if (process.env.product === 'DOE') {
                    flightName = sfInfo[0].Products__r.Name+envLabel;
                } else if (process.env.product === 'DOE-E') {
                    flightName = sfInfo[0].SF_Tracker__c + '|' +
                    sfInfo[0].Tracker_name__c + envLabel;
                }
                geoInfo =
                sfInfo[0].Commercial_Offer__r.GEO__c != null ?
                    sfInfo[0].Commercial_Offer__r.GEO__c : sfInfo[0].Geo__c;
                websiteName = sfInfo[0].Website__r.Name;
                productGroup = sfInfo[0].Commercial_Offer__r.Product_Group__c;
                tcText =
                sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c != null ?
                    sfInfo[0].Commercial_Offer__r.Offer_T_C_s__c :
                    sfInfo[0].Commercial_Offer__r.Offer_T_C_s_Text__c;
                brandname = sfInfo[0].Brand__r.Name;
                brandDisplayName =
                sfInfo[0].Brand_Display_Name__c != null ?
                    sfInfo[0].Brand_Display_Name__c : sfInfo[0].Brand__r.Name;
                // #endregion

                // gets the translations
                lookupValuesTranslation = await
                additionalFunctions.
                    getTranslations(productGroup, geoInfo, websiteName);

                // gets the ads ids and the templates ids used
                const currentAdsList = await additionalFunctions.
                    createAdsArray(currentAds);

                // if the tracker is still active then the system
                // will take the c-offer end date,
                // otherwise will take the tracker end date
                sfEndDate = sfInfo[0].Status__c === '1' ?
                    sfInfo[0].Commercial_Offer__r.End_Date__c :
                    sfInfo[0].End_Date__c;
                // with the end date the system will compare it to
                // today, if it is null or in the future then the ad
                // is active, otherwise it will be deactivated
                let isADActive = await additionalFunctions.
                    compareDates(sfEndDate);
                // if the brand or the tracker are disabled, the ad will be too
                // that is, if the status is 2
                if (sfInfo[0].Status__c === '2' ||
                sfInfo[0].Brand__r.Status__c === '2') {
                    isADActive = false;
                }

                // ***************************************
                // iterates through the ads, updating them
                // ***************************************
                await asyncForEach(currentAdsList.currentAdsIds,
                    async (ad) => {
                        try {
                            // gets the ad from kevel
                            const adSelected = await
                            additionalFunctions.getAdByID(ad.ADID);
                            // gets the template values
                            const UBD = await
                            additionalFunctions.unifiedBrandDataUpdate(offerid,
                                brandid, trackerid,
                                adSelected.Creative.AdvertiserId,
                                adSelected.Creative.TemplateId,
                                adSelected.Creative.Id,
                                adSelected.Creative.AdTypeId,
                                adSelected.Creative.Metadata, productid,
                                websiteName,
                                sfInfo[0].Commercial_Offer__r.Product_Name_Text__c,
                                sfInfo[0].Commercial_Offer__r.Name,
                                sfInfo[0].SF_Tracker__c,
                                sfInfo[0].Tracker_name__c,
                                sfInfo[0].Commercial_Offer__r.Promo_Code_Bonus_Code__c,
                                sfInfo[0].Brand__r.Brand_Rating__c, tcText,
                                sfInfo[0].Review_URL__c,
                                sfInfo[0].Primary_Tracker__c,
                                sfInfo[0].Commercial_Offer__r.Bonus_Type__c,
                                sfInfo[0].Commercial_Offer__r.Product_Group__c,
                                sfInfo[0].Brand__r.External_Logo_Url__c,
                                brandname, geoInfo,
                                lookupValuesTranslation, brandDisplayName);
                            // updates the creative
                            const creativeUpdated = await additionalFunctions.
                                updateCreative(adSelected.Creative.Id,
                                    adSelected.Creative.AdvertiserId, UBD.title,
                                    adSelected.Creative.AdTypeId,
                                    adSelected.Creative.Url,
                                    adSelected.Creative.TemplateId,
                                    UBD.template_values, UBD.metadata);
                            mainLogger.info('Creative updated:'+
                            adSelected.Creative.Id);
                            // calls the ad update
                            const adUpdated = await additionalFunctions.
                                updateAd(flightid, adSelected.Id,
                                    adSelected.Creative.Id, isADActive,
                                    kevelwebsiteid,
                                    sfInfo[0].Commercial_Offer__r.Start_Date__c,
                                    sfEndDate);
                            mainLogger.info('ad updated:'+
                            adSelected.Id);
                        } catch (e) {
                            errorLogger.info('Error updating ad:' + ad +
                            ', error:' + e);
                        }
                    });

                // ***************************************
                // updates the geo for the current flight
                // ***************************************

                // if there's valid information for the geo and
                // the geo is active on the tracker then we
                // recreate the geo information

                if (geoInfo && sfInfo[0].Remove_Geo__c == false) {
                    try {
                        if (process.env.product === 'DOE') {
                            const countryRegionName = await
                            additionalFunctions.splitCountryRegion(geoInfo);
                            const geoCreation = await
                            additionalFunctions.geoForFlights(flightid,
                                countryRegionName.country,
                                countryRegionName.region,
                                sfInfo[0].Remove_Geo__c);
                            flightName = sfInfo[0].Products__r.Name + ' ' +
                            countryRegionName.country + envLabel;
                            mainLogger.info('Geo updated');
                        } else if (process.env.product === 'DOE-E') {
                            const geoCreation = await
                            additionalFunctions.geoForFlightsDOEE(flightid,
                                geoInfo, sfInfo[0].Remove_Geo__c);
                            mainLogger.info('Geo updated');
                        }
                    } catch (errorGeo) {
                        errorLogger.info('Error updating geo:' + errorGeo);
                    }
                }

                // ***************************************
                // updates the flight, activating, deactivating it
                // and updates the flight name with the latest geo
                // ***************************************

                // checks if all the ads from the flight are inactive
                // if they are it returns a false, otherwise returns a true

                try {
                    const getAds = await additionalFunctions.
                        getAdsByFlight(flightid);
                    isActive = await additionalFunctions.
                        checkAdsInsideFlight(getAds.items);

                    // calls the update function
                    await additionalFunctions.
                        updateFlight(flightName, flightid, isActive);
                    mainLogger.info('Flight updated');
                } catch (errorFlight) {
                    errorLogger.info('Error updating flight:' + errorFlight);
                }

                mainLogger.info('end of tracker:' + trackerid);
                return resolve('ok');
            } catch (eInfo) {
                errorLogger.info('error in main offer to kevel update:' +
                eInfo + ', tracker id:' + trackerid);
                return resolve(new Error('error while bringing data'));
            }
        };
        update();
    });
};

const main = async () => {
    try {
        mainLogger.info('Starting operations');
        const queue = new Queue({
            concurrent: 5,
            interval: 60000,
            start: false,
        });

        // User confirm the modify operation
        let options = 'You are going to use the massive updater using the following configuration: \n\t';
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
                        return offertokevelupdate(automaticElement.entry.col1,
                            automaticElement.entry.col2,
                            automaticElement.entry.col3,
                            automaticElement.entry.col4,
                            automaticElement.entry.col5,
                            automaticElement.entry.col6,
                            automaticElement.entry.col7,
                            automaticElement.entry.col9);
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
    } catch (eLookup) {
        // error bringing the lookup table, the process stops
        errorLogger.info('Error bringing the lookup table:' + eLookup);
    }
};

main();
