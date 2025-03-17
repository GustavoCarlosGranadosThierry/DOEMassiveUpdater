require('dotenv').config();
const axios = require('axios');
const createLogger = require('./logger');
const debugflightsLogger = createLogger.getLogger('massive-reporter-flights-log');
const errorLogger = createLogger.getLogger('error-massive-updater-log');
const missingTemplatesLogger = createLogger.getLogger('missing-templates-log');

// ***************************************
// Variables related to the environment
// ***************************************

const config = {
    // for generaluse
    product: process.env.product,
    env: process.env.environment,
    workatoAPIToken: process.env.workatoAPIToken,
    kevelAPIToken: process.env.kevelAPIToken,
    automaticLogEndpoint: process.env.automaticLogEndpoint,
    brandColorEndpoint: process.env.brandColorEndpoint,
    site: '', // use '' for all the sites and 'siteurl' for filtering, the site should be the same as in the lookup table
};

// ***************************************
// Global variables related to workato settings
// ***************************************

const translationsExpected = 5;
const DOEVisibleVariableRel =
    'ct_offer_Promo_Code_Bonus_Code__c|ct_template_promo_hidden,ct_tracker_Review_URL__c|ct_template_read_review_hidden,ct_offer_Offer_T_C_s_Text__c|ct_template_tc_hidden';
const DOEVisibleCSSClass = 'sports-offer-card--hidden';
const RateType = 3;
const Price = 2;

// #region data functions

const delay = (t, val) => new Promise((resolve) => setTimeout(resolve, t, val));

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function getDateSF() {
    return new Promise((resolve, reject) => {
        try {
            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth();
            const year = today.getFullYear();
            if (month < 9) {
                return resolve(year + '-0' + (Number(month) + 1).toString() + '-' + day);
            } else {
                return resolve(year + '-' + (Number(month) + 1).toString() + '-' + day);
            }
        } catch (e) {
            return reject(new Error('Error while getting the today date:' + e));
        }
    });
}

async function transformBrandLogoUrl(brand_url, logo_size) {
    return new Promise((resolve, reject) => {
        try {
            let transformed_url = '';
            if (brand_url) {
                const splitted = brand_url.split('upload');
                if (splitted.length == 2) {
                    transformed_url = splitted[0] + `upload/w_${logo_size},c_scale,f_auto` + splitted[1];
                }
            }
            return resolve(transformed_url);
        } catch (e) {
            return reject(new Error('Error while transforming the url:' + e));
        }
    });
}

async function createAdsArray(ids) {
    return new Promise((resolve, reject) => {
        try {
            const tmpSplit = ids.split('|');
            // const currentTemplatesIds = [];
            // const currentAdsIds = [];
            const adsSplit = [];
            const templatesSplit = [];
            tmpSplit.forEach((e) => {
                const tmpSplitE = e.split(';');
                if (tmpSplitE && tmpSplitE.length == 2) {
                    adsSplit.push({ ADID: tmpSplitE[0] });
                    templatesSplit.push({ TemplateID: tmpSplitE[1] });
                }
            });
            return resolve({ currentAdsIds: adsSplit, currentTemplatesIds: templatesSplit });
        } catch (e) {
            return reject(new Error('Error while parsing the ids:' + e));
        }
    });
}

async function returnMissingTemplatesIdsFromFlight(usedTemplates, currentTemplates) {
    return new Promise((resolve, reject) => {
        try {
            const currentIDs = [];
            const usedIDs = [];
            currentTemplates.items.forEach((element) => {
                currentIDs.push(element.Id.toString());
            });
            usedTemplates.forEach((element) => {
                usedIDs.push(element.TemplateID.toString());
            });
            const missingTemplates = currentIDs.filter((item) => !usedIDs.includes(item));
            return resolve(missingTemplates);
        } catch (e) {
            return reject(new Error('Error while finding the missing templates ids:' + e));
        }
    });
}

async function createCommaSeparatedTemplateList(currentTemplates) {
    return new Promise((resolve, reject) => {
        try {
            const currentIDs = [];
            currentTemplates.items.forEach((element) => {
                currentIDs.push(element.Id.toString());
            });
            const templateIDList = currentIDs.join(',');
            return resolve(templateIDList);
        } catch (e) {
            return reject(new Error('Error while parsing the ids:' + e));
        }
    });
}

async function mergeVariableData(
    jsonKevelFields,
    coffername,
    promocode,
    tctext,
    isprimarytracker,
    bonustype,
    productgroup,
    brandlogourl,
    brandname,
    starrating,
    readreviewlink,
    branddisplayname,
    trackersf,
    geo,
    trackername,
    brandColors,
) {
    return new Promise((resolve, reject) => {
        try {
            // #region Kevel fields Cleanup
            // this will delete unnecesary information coming from kevel
            // the process only needs the variable name
            jsonKevelFields.forEach((elementKevel) => {
                delete elementKevel.AdQuery;
                delete elementKevel.Description;
                delete elementKevel.Name;
                delete elementKevel.Required;
                delete elementKevel.Type;
            });
            // #endregion
            // #region Custom JSON Creation
            // this JSON is the information coming from SF
            // if another field is created and populated through SF
            // the variable should be added here with the respective
            // variable name matching the one in kevel template
            const arrayFixed = [];
            arrayFixed.push({ ct_offer_Name: coffername });
            arrayFixed.push({ ct_offer_Promo_Code_Bonus_Code__c: promocode });
            arrayFixed.push({ ct_offer_Offer_T_C_s_Text__c: tctext });
            arrayFixed.push({ ct_tracker_Primary_Tracker__c: isprimarytracker });
            arrayFixed.push({ ct_offer_Bonus_Type__c: bonustype });
            arrayFixed.push({ ct_offer_Product_Group__c: productgroup });
            arrayFixed.push({ ct_brand_External_Logo_Url__c: brandlogourl });
            arrayFixed.push({ ct_brand_Name: brandname });
            arrayFixed.push({ ct_brand_Brand_Rating__c: starrating });
            arrayFixed.push({ ct_tracker_Review_URL__c: readreviewlink });
            arrayFixed.push({ ct_tracker_Brand_Display_Name__c: branddisplayname });
            arrayFixed.push({ ct_tracker_Geo__c: geo });
            arrayFixed.push({ ct_tracker_SF_Tracker__c: trackersf });
            arrayFixed.push({ ct_tracker_Name: trackername });
            // #endregion
            // #region variable Declaration
            // this will keep the tracker of which important
            // variable is appearing in the template
            const finishedarray = {};
            let star_rating_found = false;
            let logo_found = false;
            let tc_found = false;
            let cta_found = false;
            let review_found = false;
            let promo_code_found = false;
            let featured_text_found = false;
            // #endregion
            // #region splitting variables and discovery
            // we add all the variables from kevel inside the finishedArray
            // also we flag if we found special elements within the template
            jsonKevelFields.forEach((elementKevel) => {
                if (elementKevel.Variable != 'ctadtype' && elementKevel.Variable != 'ctlogosize') finishedarray[elementKevel.Variable] = '';
                if (elementKevel.Variable === 'ct_brand_Brand_Rating__c') star_rating_found = true;
                if (elementKevel.Variable === 'ct_brand_External_Logo_Url__c') logo_found = true;
                if (elementKevel.Variable === 'ct_template_tcLabel') tc_found = true;
                if (elementKevel.Variable === 'ct_template_cta') cta_found = true;
                if (elementKevel.Variable === 'ct_template_reviewLabel') review_found = true;
                if (elementKevel.Variable === 'ct_template_copied') promo_code_found = true;
                if (elementKevel.Variable === 'ct_template_featuredText') featured_text_found = true;
            });
            // #endregion
            // #region data match
            // we find the matching value from kevel template to the SF info
            // if there's a match then the value will be assigned
            // with this we can send the variable with its value to kevel
            jsonKevelFields.forEach((elementKevel) => {
                for (const [keykevel, valueKevel] of Object.entries(elementKevel)) {
                    arrayFixed.forEach((elementFixed) => {
                        for (const [key, value] of Object.entries(elementFixed)) {
                            // if both the element on kevel and SF match
                            if (valueKevel === key) {
                                let fixValue = '';
                                if (value) {
                                    fixValue = value.toString().replace(/"/g, '');
                                }
                                finishedarray[key] = fixValue;
                                break;
                            }
                        }
                    });
                }
            });
            // #endregion
            // #region data cleanup and toggle hidden
            // we make a final cleanup for the visible properties,
            // these might not be added to the final array because
            // there is no match
            const arrayRelation = DOEVisibleVariableRel.split(',');

            jsonKevelFields.forEach((elementKevel) => {
                for (let i = 0; i < arrayRelation.length; i++) {
                    if (arrayRelation[i] && arrayRelation[i].includes('|')) {
                        const splittedElement = arrayRelation[i].split('|');
                        if (splittedElement.length === 2) {
                            if (splittedElement[1] && splittedElement[1] === elementKevel.Variable) {
                                finishedarray[elementKevel.Variable] = '';
                                break;
                            }
                        }
                    }
                }
            });

            // cleaning up the result for any special characters that may
            // break the json.stringify
            let tmp_Cleanup = JSON.stringify(finishedarray);
            tmp_Cleanup = tmp_Cleanup.replace(/\n/g, '');
            tmp_Cleanup = tmp_Cleanup.replace(/\r/g, '');
            tmp_Cleanup = tmp_Cleanup.replace(/\\/g, '');
            tmp_Cleanup = tmp_Cleanup.replace(/\u2013|\u2014/g, '-');
            tmp_Cleanup = tmp_Cleanup.replace(/"/g, '\\"');
            // #endregion
            return resolve({
                template_values: tmp_Cleanup,
                star_rating_found: star_rating_found,
                logo_found: logo_found,
                tc_found: tc_found,
                cta_found: cta_found,
                review_found: review_found,
                promo_code_found: promo_code_found,
                featured_text_found: featured_text_found,
            });
        } catch (e) {
            return reject(new Error('something broke in the merge variable:' + e));
        }
    });
}

async function visibleToggleVariables(template_values) {
    return new Promise((resolve, reject) => {
        try {
            const template_values_tmp = template_values.replace(/\\/g, '');
            const updated_template_values_tmp = JSON.parse(template_values_tmp);
            const arrayRelation = DOEVisibleVariableRel.split(',');
            for (let i = 0; i < arrayRelation.length; i++) {
                if (arrayRelation[i] && arrayRelation[i].includes('|')) {
                    const splittedElement = arrayRelation[i].split('|');
                    if (splittedElement.length === 2) {
                        const varName = splittedElement[0];
                        const varName2 = splittedElement[1];
                        if (updated_template_values_tmp.hasOwnProperty(varName) && updated_template_values_tmp[varName] != '') {
                            updated_template_values_tmp[varName2] = '';
                        } else if (updated_template_values_tmp.hasOwnProperty(varName) && updated_template_values_tmp[varName] === '') {
                            updated_template_values_tmp[varName2] = DOEVisibleCSSClass;
                        }
                    }
                }
            }
            const updated_template_values = JSON.stringify(updated_template_values_tmp).replace(/"/g, '\\"');
            return resolve(updated_template_values);
        } catch (error) {
            return reject(new Error('visible toggling error:' + error));
        }
    });
}

async function assignBrandColors(template_values, brand_colors, templateid) {
    return new Promise((resolve, reject) => {
        try {
            const template_values_tmp = template_values.replace(/\\/g, '');
            const updated_template_values_tmp = JSON.parse(template_values_tmp);
            const colors = brand_colors.template_colors.split('|');
            // we search for the elements in the colors array inside
            // the template_values json, if found we replace it with the css
            for (let i = 0; i < colors.length; i++) {
                if (colors[i] && colors[i].includes(';')) {
                    const splittedElement = colors[i].split(';');
                    // validation
                    if (splittedElement.length === 3) {
                        const templateID = splittedElement[0];
                        const variableName = splittedElement[1];
                        const cssName = splittedElement[2];
                        if (templateID === templateid) {
                            if (updated_template_values_tmp.hasOwnProperty(variableName)) {
                                try {
                                    updated_template_values_tmp[variableName] = cssName;
                                } catch (e) {
                                    updated_template_values_tmp[variableName] = '';
                                }
                            }
                        }
                    }
                }
            }
            const updated_template_values = JSON.stringify(updated_template_values_tmp).replace(/"/g, '\\"');
            return resolve(updated_template_values);
        } catch (error) {
            return reject(new Error('visible toggling error:' + error));
        }
    });
}

async function starGenerator(star_rating) {
    return new Promise((resolve, reject) => {
        try {
            const starRating = parseFloat(star_rating, 10);
            let ratingImagePath = false;
            switch (starRating) {
            case 1:
                ratingImagePath = '/6IZHKOLAO5HOFFSPY3G7T5KVGE.png';
                break;
            case 1.5:
                ratingImagePath = '/6UODT6AG6JFSVNFE6XYH6427GU.png';
                break;
            case 2:
                ratingImagePath = '/NNMEI4AB7VCBNHY2HSPZHBMPV4.png';
                break;
            case 2.5:
                ratingImagePath = '/6INPGWKY4REYNMU3UUQE6K7KJA.png';
                break;
            case 3:
                ratingImagePath = '/VUODN7O3DRFSFD3HDNAXTA7HEE.png';
                break;
            case 3.5:
                ratingImagePath = '/D5ZZYHOF2VBOBIAEXBNXC466JM.png';
                break;
            case 4:
                ratingImagePath = '/GEKZFBYRRBHXNCLC5K62WXMI3I.png';
                break;
            case 4.5:
                ratingImagePath = '/6BQYF67K3RCEPNAOHV5NHTIYIE.png';
                break;
            case 5:
                ratingImagePath = '/MCODFFRSHVAPPHGEKYFIBYV3TY.png';
                break;
            default:
                ratingImagePath = '/MCODFFRSHVAPPHGEKYFIBYV3TY.png';
                break;
            }
            const replaced_markup = `<img src='https://system101.info/static/assets/doe-assets${ratingImagePath}' alt='star rating ${starRating}' width='98px' height='14px'>`;
            return resolve(replaced_markup);
        } catch (error) {
            return reject(new Error('star generator error:' + error));
        }
    });
}

async function translateOffer(
    template_values,
    start_rating_found,
    cta_found,
    tc_found,
    review_found,
    promo_code_found,
    featured_text_found,
    brand_name,
    lookup_values,
    star_rating_markup,
) {
    return new Promise((resolve, reject) => {
        try {
            // template values transformation
            const template_values_tmp = template_values.replace(/\\/g, '');
            const updated_template_values_tmp = JSON.parse(template_values_tmp);

            const translationMaster = lookup_values.split('|');
            for (let i = 0; i < translationMaster.length; i++) {
                const translationElement = translationMaster[i].split(';');
                if (translationElement.length == 2) {
                    switch (translationElement[0]) {
                    case 'Read Review':
                        if (review_found === true) {
                            if (translationElement[1].includes('{{Brand}}')) {
                                updated_template_values_tmp.ct_template_reviewLabel = translationElement[1].replace(/{{Brand}}/g, brand_name);
                            } else {
                                updated_template_values_tmp.ct_template_reviewLabel = translationElement[1];
                            }
                        }
                        break;
                    case 'CTA Text':
                        if (cta_found === true) {
                            updated_template_values_tmp.ct_template_cta = translationElement[1];
                        }
                        break;
                    case 'T&C Text':
                        if (tc_found === true) {
                            updated_template_values_tmp.ct_template_tcLabel = translationElement[1];
                        }
                        break;
                    case 'Copied':
                        if (promo_code_found === true) {
                            updated_template_values_tmp.ct_template_copied = translationElement[1];
                        }
                        break;
                    case 'Featured Text':
                        if (featured_text_found === true) {
                            updated_template_values_tmp.ct_template_featuredText = translationElement[1];
                        }
                        break;
                    }
                }
            }
            if (start_rating_found === true && star_rating_markup) {
                updated_template_values_tmp.ct_brand_Brand_Rating__c = star_rating_markup;
            }
            const updated_template_values = JSON.stringify(updated_template_values_tmp).replace(/"/g, '\\"');
            return resolve(updated_template_values);
        } catch (error) {
            return reject(new Error('translate offer error:' + error));
        }
    });
}

async function unifiedBrandDataUpdate(
    offerid,
    brandid,
    trackerid,
    advertiserid,
    templateid,
    creativeid,
    adtypeid,
    metadata,
    productid,
    website,
    productname,
    coffername,
    trackerpublicid,
    trackername,
    promocode,
    starrating,
    tctext,
    readreviewlink,
    isprimarytracker,
    bonustype,
    productgroup,
    brandlogourl,
    brandname,
    geo,
    lookupvaluetranslations,
    branddisplayname,
    brandColors,
) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                // gets the kevel template fields and template name
                const jsonKevelFields = await getKevelTemplateFields(templateid);
                // variables creation and assignment
                const adTitleSite = (website + '|' + productname + '|' + coffername + '|' + jsonKevelFields.Name + '|' + trackerpublicid + '|' + trackername)
                    .toString()
                    .replace(/\"/g, '');
                const metadataAd =
                    '{"trackerid":"' +
                    trackerid +
                    '", "offerid":"' +
                    offerid +
                    '", "brandid":"' +
                    brandid +
                    '", "productid":"' +
                    productid +
                    '", "templateid":"' +
                    templateid +
                    '", "templateName":"' +
                    jsonKevelFields.Name +
                    '"}';
                // generation of the template values
                const mergedVariables = await mergeVariableData(
                    jsonKevelFields.Fields,
                    coffername,
                    promocode,
                    tctext,
                    isprimarytracker,
                    bonustype,
                    productgroup,
                    brandlogourl,
                    brandname,
                    starrating,
                    readreviewlink,
                    branddisplayname,
                    trackerpublicid,
                    geo,
                    trackername,
                );
                // toggle visible variables
                const toggledVisible = await visibleToggleVariables(mergedVariables.template_values);

                // change brand colors
                const changedColors = await assignBrandColors(toggledVisible, brandColors, templateid);

                let starMarkup = '';
                if (mergedVariables.star_rating_found == true && starrating) {
                    starMarkup = await starGenerator(starrating);
                }

                const translatedOffer = await translateOffer(
                    changedColors,
                    mergedVariables.star_rating_found,
                    mergedVariables.cta_found,
                    mergedVariables.tc_found,
                    mergedVariables.review_found,
                    mergedVariables.promo_code_found,
                    mergedVariables.featured_text_found,
                    branddisplayname != null ? branddisplayname : brandname,
                    lookupvaluetranslations,
                    starMarkup,
                    branddisplayname,
                );

                return resolve({
                    template_values: translatedOffer,
                    title: adTitleSite,
                    metadata: metadataAd,
                });
            } catch (error) {
                return reject(error);
            }
        };
        automaticTask();
    });
}

async function unifiedBrandDataCreate(
    offerid,
    brandid,
    trackerid,
    advertiserid,
    templateid,
    creativeid,
    adtypeid,
    metadata,
    productid,
    website,
    productname,
    coffername,
    trackerpublicid,
    trackername,
    promocode,
    starrating,
    tctext,
    readreviewlink,
    isprimarytracker,
    bonustype,
    productgroup,
    brandlogourl,
    brandname,
    geo,
    lookupvaluetranslations,
    branddisplayname,
    brandColors,
) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                // gets the kevel template fields and template name
                const jsonKevelFields = await getKevelTemplateFields(templateid);
                // variables creation and assignment
                const adTitleSite = (website + '|' + productname + '|' + coffername + '|' + jsonKevelFields.Name + '|' + trackerpublicid + '|' + trackername)
                    .toString()
                    .replace(/\"/g, '');
                const metadataAd =
                    '{"trackerid":"' +
                    trackerid +
                    '", "offerid":"' +
                    offerid +
                    '", "brandid":"' +
                    brandid +
                    '", "productid":"' +
                    productid +
                    '", "templateid":"' +
                    templateid +
                    '", "templateName":"' +
                    jsonKevelFields.Name +
                    '"}';
                // generation of the template values
                const mergedVariables = await mergeVariableData(
                    jsonKevelFields.Fields,
                    coffername,
                    promocode,
                    tctext,
                    isprimarytracker,
                    bonustype,
                    productgroup,
                    brandlogourl,
                    brandname,
                    starrating,
                    readreviewlink,
                    branddisplayname,
                    trackerpublicid,
                    geo,
                    trackername,
                );
                // toggle visible variables
                const toggledVisible = await visibleToggleVariables(mergedVariables.template_values);

                // change brand colors
                const changedColors = await assignBrandColors(toggledVisible, brandColors, templateid);

                // assign star image
                let starMarkup = '';
                if (mergedVariables.star_rating_found == true && starrating) {
                    starMarkup = await starGenerator(starrating);
                }

                const translatedOffer = await translateOffer(
                    changedColors,
                    mergedVariables.star_rating_found,
                    mergedVariables.cta_found,
                    mergedVariables.tc_found,
                    mergedVariables.review_found,
                    mergedVariables.promo_code_found,
                    mergedVariables.featured_text_found,
                    branddisplayname != null ? branddisplayname : brandname,
                    lookupvaluetranslations,
                    starMarkup,
                    branddisplayname,
                );

                return resolve({
                    template_values: translatedOffer,
                    title: adTitleSite,
                    metadata: metadataAd,
                });
            } catch (error) {
                return reject(error);
            }
        };
        automaticTask();
    });
}

async function compareDates(endDateSF) {
    return new Promise((resolve, reject) => {
        try {
            if (endDateSF) {
                // if the end date from SF is not null we compare
                const endDate = endDateSF;
                const today = getDateSF();
                const dateToday = new Date(today);
                const dateEndD = new Date(endDate);
                let boolControl = false;
                if (dateEndD > dateToday) {
                    boolControl = true;
                } else if (dateEndD <= dateToday) {
                    boolControl = false;
                }
                return resolve(boolControl);
            } else {
                // if it is null is an automatic pass
                return resolve(true);
            }
        } catch (error) {
            return reject(new Error('Error comparing dates:' + error));
        }
    });
}

async function splitCountryRegion(geoInfo) {
    return new Promise((resolve, reject) => {
        try {
            const splitGeo = geoInfo.split('-').map(function(value) {
                return value.trim();
            });
            let country = '';
            let region = '';
            if (splitGeo.length && splitGeo.length == 1) {
                country = splitGeo[0];
                if (country === 'USA') country = 'United States';
                return resolve({ country, region });
            } else if (splitGeo.length && splitGeo.length > 1) {
                country = splitGeo[0];
                if (country === 'USA') country = 'United States';
                region = splitGeo[1];
                return resolve({ country, region });
            } else {
                return resolve({ country, region });
            }
        } catch (error) {
            return reject(new Error('error in split country:' + error));
        }
    });
}

async function splitCountryRegionArray(SF_Geo) {
    return new Promise((resolve, reject) => {
        try {
            const finalArray = [];
            // const current_countries_regions = [];
            const geoSplitted = SF_Geo.split(';');
            geoSplitted.forEach((element) => {
                // split and trim of each geo
                const splitGeo = element.split('-').map(function(value) {
                    return value.trim();
                });
                let country = '';
                let region = '';
                if (splitGeo.length && splitGeo.length == 1) {
                    country = splitGeo[0];
                    if (country === 'USA') {
                        country = 'United States';
                    }
                } else if (splitGeo.length && splitGeo.length > 1) {
                    country = splitGeo[0];
                    if (country === 'USA') {
                        country = 'United States';
                    }
                    region = splitGeo[1];
                }
                finalArray.push({ country: country, region: region });
            });
            return resolve({ current_countries_regions: finalArray });
        } catch (error) {
            return reject(new Error('error in split country array:' + error));
        }
    });
}

async function clearGeoFromFlight(flightSelected) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                await asyncForEach(flightSelected.GeoTargeting, async (geo) => {
                    await deleteGeoFromFlight(flightSelected.Id, geo.LocationId);
                });
                return resolve('ok');
            } catch (error) {
                return reject(error);
            }
        };
        automaticTask();
    });
}

async function geoLookupCode(countrySel, regionSel) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                let countryCode = '';
                let regionCode = '';
                const countriesList = await getListCountriesKevel();
                await asyncForEach(countriesList, async (country) => {
                    if (country.Name === countrySel) {
                        countryCode = country.Code;
                        if (regionSel) {
                            // exception for the Yukon
                            if (regionSel.includes('Yukon')) {
                                regionCode = 'YT';
                            } else {
                                // region lookup for any other region
                                for (const [keyJson, valueJson] of Object.entries(country.Regions)) {
                                    if (valueJson.Name === regionSel) {
                                        regionCode = valueJson.Code;
                                    }
                                }
                            }
                            // if there's no match in the region we'll return empty values for both country and region
                            // this is a mechanism that will stop the geo creation because of a non existing region
                            // we log the case in the error log
                            if (regionCode === '') {
                                countrycode = regionCode = null;
                                errorLogger.info('No region match found in kevel for:' + regionSel);
                            }
                        }
                    }
                });
                return resolve({ countryCode, regionCode });
            } catch (error) {
                return reject(error);
            }
        };
        automaticTask();
    });
}

async function geoForFlights(flightid, countryName, regionName, removeGeo) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                const flightSelected = await getFlightByID(flightid);
                // if the flight has geo already setted we clear them all
                if (flightSelected.GeoTargeting && flightSelected.GeoTargeting.length > 0) {
                    await clearGeoFromFlight(flightSelected);
                }
                // if the remove geo is false and the country name is present
                // we create the new geo information
                if (removeGeo == false && countryName) {
                    const countryRegion = await geoLookupCode(countryName, regionName);
                    if (countryRegion.countryCode) {
                        await createGeoKevel(flightid, countryRegion.countryCode, countryRegion.regionCode);
                    }
                }
                return resolve('ok');
            } catch (error) {
                return reject(new Error('Error creating geo:' + error));
            }
        };
        automaticTask();
    });
}

async function geoForFlightsDOEE(flightid, geoInfo, removeGeo) {
    return new Promise((resolve, reject) => {
        const automaticTask = async () => {
            try {
                const flightSelected = await getFlightByID(flightid);
                // if the flight has geo already setted we clear them all
                if (flightSelected.GeoTargeting && flightSelected.GeoTargeting.length > 0) {
                    await clearGeoFromFlight(flightSelected);
                }
                // if the remove geo is false and the country name is present
                // we create the new geo information
                if (removeGeo == false && geoInfo) {
                    // gets the array of countries-regions
                    const splitCountries = await splitCountryRegionArray(geoInfo);
                    // for each one of the countries and regions
                    // registers the geo in kevel
                    await asyncForEach(splitCountries.current_countries_regions, async (element) => {
                        const countryRegion = await geoLookupCode(element.country, element.region);

                        if (countryRegion.countryCode) {
                            await createGeoKevel(flightid, countryRegion.countryCode, countryRegion.regionCode);
                        }
                    });
                }
                return resolve('ok');
            } catch (error) {
                return reject(new Error('Error creating geo DOE-E:' + error));
            }
        };
        automaticTask();
    });
}

async function checkAdsInsideFlight(adsFlight) {
    return new Promise((resolve, reject) => {
        try {
            const automaticTask = async () => {
                const currentAds = adsFlight.length;
                let inactiveAds = 0;
                let isActive = true;
                await asyncForEach(adsFlight, async (ad) => {
                    if (ad.IsActive == false) {
                        inactiveAds += 1;
                    }
                });

                if (currentAds === inactiveAds) {
                    isActive = false;
                }
                return resolve(isActive);
            };
            automaticTask();
        } catch (error) {
            return reject(error);
        }
    });
}

// #endregion

// #region Workato endpoints

async function getInformationSF(trackerid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        const infoSF = async () => {
            do {
                const data = JSON.stringify({
                    trackerid: trackerid,
                });

                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://apim.workato.com/${envAPI}/doe/doeinfosf`,
                    headers: {
                        'Content-Type': 'application/json',
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                    data: data,
                };

                try {
                    const response = await axios.request(config);
                    const tmpJson = JSON.parse(response.data.info);
                    return resolve(tmpJson);
                } catch (eInfo) {
                    // didn't found anything
                    if (eInfo.message.includes('404')) {
                        return reject(new Error('not found'));
                    } else {
                        // possible bad connection, retry
                        await delay(3000);
                        console.log(eInfo);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(new Error('connection error'));
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        infoSF();
    });
}

async function getAutomaticLookupTable(objecttype = null, objectid = null) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        let optionalParameters = '';
        if (config.site === '') {
            optionalParameters = objecttype === null ? '' : `?objectid=${objectid}&objectType=${objecttype}`;
        } else {
            optionalParameters = objecttype === null ? '' : `&objectid=${objectid}&objectType=${objecttype}`;
        }
        const url = config.site === '' ? `https://apim.workato.com/${envAPI}/doe/${process.env.automaticLogEndpoint}${optionalParameters}` :
            `https://apim.workato.com/${envAPI}/doe/${process.env.automaticLogEndpoint}?website=${config.site}${optionalParameters}`;
        const automaticLookup = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: url,
                    headers: {
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                };

                try {
                    const response = await axios.request(config);
                    const tmpJson = JSON.parse(response.data.lookupTable);
                    processControl = true;
                    return resolve(tmpJson);
                } catch (eAutomatic) {
                    await delay(3000);
                    console.log(eAutomatic);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('connection error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        automaticLookup();
    });
}

async function getTranslations(productGroup, Geo, website) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        const geoFixed = Geo === '' ? 'fallback' : Geo;
        const productGroupFixed = productGroup === '' ? 'fallback' : productGroup;
        const automaticLookup = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://apim.workato.com/${envAPI}/doe/doetranslation`,
                    headers: {
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                };

                try {
                    const response = await axios.request(config);
                    const tmpJson = JSON.parse(response.data.lookupTable);
                    let translations = [];
                    let lookupValuesTranslation = '';
                    // exact match: geo and product group from the request are within the lookup table (translations for a site-geo-product group)
                    tmpJson.filter((element) => {
                        if (element.entry.col1 === website && element.entry.col5 === geoFixed && element.entry.col6 === productGroupFixed) {
                            translations.push(element);
                            if (lookupValuesTranslation === '') {
                                lookupValuesTranslation = element.entry.col3 + ';' + element.entry.col4;
                            } else {
                                lookupValuesTranslation += '|' + element.entry.col3 + ';' + element.entry.col4;
                            }
                        }
                    });
                    if (translations.length == translationsExpected) {
                        return resolve(lookupValuesTranslation);
                    } else {
                        // second iteration: geo available but default product group (translation for a website, geo but to all product groups)
                        translations = [];
                        lookupValuesTranslation = '';
                        tmpJson.filter((element) => {
                            if (element.entry.col1 === website && element.entry.col5 === geoFixed && element.entry.col6 === 'fallback') {
                                translations.push(element);
                                if (lookupValuesTranslation === '') {
                                    lookupValuesTranslation = element.entry.col3 + ';' + element.entry.col4;
                                } else {
                                    lookupValuesTranslation += '|' + element.entry.col3 + ';' + element.entry.col4;
                                }
                            }
                        });
                        if (translations.length == translationsExpected) {
                            return resolve(lookupValuesTranslation);
                        } else {
                            // third iteration: no geo available but product group ok (translations for a site-product group)
                            translations = [];
                            lookupValuesTranslation = '';
                            tmpJson.filter((element) => {
                                if (element.entry.col1 === website && element.entry.col5 === 'fallback' && element.entry.col6 === productGroupFixed) {
                                    translations.push(element);
                                    if (lookupValuesTranslation === '') {
                                        lookupValuesTranslation = element.entry.col3 + ';' + element.entry.col4;
                                    } else {
                                        lookupValuesTranslation += '|' + element.entry.col3 + ';' + element.entry.col4;
                                    }
                                }
                            });
                            if (translations.length == translationsExpected) {
                                return resolve(lookupValuesTranslation);
                            } else {
                            // fourth iteration: no geo or product available but website ok (translations for a website)
                                translations = [];
                                lookupValuesTranslation = '';
                                tmpJson.filter((element) => {
                                    if (element.entry.col1 === website && element.entry.col5 === 'fallback' && element.entry.col6 === 'fallback') {
                                        translations.push(element);
                                        if (lookupValuesTranslation === '') {
                                            lookupValuesTranslation = element.entry.col3 + ';' + element.entry.col4;
                                        } else {
                                            lookupValuesTranslation += '|' + element.entry.col3 + ';' + element.entry.col4;
                                        }
                                    }
                                });
                                if (translations.length == translationsExpected) {
                                    return resolve(lookupValuesTranslation);
                                } else {
                                // fifth iteration: fallback values
                                    translations = [];
                                    lookupValuesTranslation = '';
                                    tmpJson.filter((element) => {
                                        if (element.entry.col1 === 'fallback' && element.entry.col5 === 'fallback' && element.entry.col6 === 'fallback') {
                                            translations.push(element);
                                            if (lookupValuesTranslation === '') {
                                                lookupValuesTranslation = element.entry.col3 + ';' + element.entry.col4;
                                            } else {
                                                lookupValuesTranslation += '|' + element.entry.col3 + ';' + element.entry.col4;
                                            }
                                        }
                                    });
                                    if (translations.length == translationsExpected) {
                                        return resolve(lookupValuesTranslation);
                                    } else {
                                        return reject(new Error('no translations'));
                                    }
                                }
                            }
                        }
                    }
                } catch (eAutomatic) {
                    await delay(3000);
                    console.log(eAutomatic);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('communication error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        automaticLookup();
    });
}

async function flightSearchGeoCreation(flightid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        const automaticLookup = async () => {
            do {
                const data = JSON.stringify({
                    flightid: flightid,
                });
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://apim.workato.com/${envAPI}/doe/searchflights`,
                    headers: {
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                    data: data,
                };

                try {
                    const response = await axios.request(config);
                    const tmpJson = JSON.parse(response.data.lookupTable);
                    await asyncForEach(tmpJson, async (element) => {
                        const trackerSel = await getInformationSF(element.entry.col1);
                        if (trackerSel[0].Remove_Geo__c === true) {
                            return resolve(true);
                        }
                    });
                    return resolve(false);
                } catch (eAutomatic) {
                    await delay(3000);
                    console.log(eAutomatic);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('communication error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        automaticLookup();
    });
}

async function getBrandColors(website, templates, brand) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        const url = `https://apim.workato.com/${envAPI}/doe/${process.env.brandColorEndpoint}`;
        const brandColorLookup = async () => {
            do {
                const data = JSON.stringify({
                    website: website,
                    templates: templates,
                    brand: brand,
                });
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: url,
                    headers: {
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                    data: data,
                };

                try {
                    const response = await axios.request(config);
                    processControl = true;
                    return resolve(response.data);
                } catch (eAutomatic) {
                    await delay(3000);
                    console.log(eAutomatic);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('connection error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        brandColorLookup();
    });
}

async function updateLookupTableWorkato(lookupid, adlist) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const envAPI = process.env.environment === 'staging' ? 'webpals_stg' : 'webpals-prod';
        const url = `https://apim.workato.com/${envAPI}/doe/edoeupdatelookup`;
        const brandColorLookup = async () => {
            do {
                const data = JSON.stringify({
                    LookupId: lookupid,
                    adList: adlist,
                });
                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: url,
                    headers: {
                        'API-TOKEN': process.env.workatoAPIToken,
                    },
                    data: data,
                };

                try {
                    const response = await axios.request(config);
                    processControl = true;
                    return resolve(response.data);
                } catch (eAutomatic) {
                    await delay(3000);
                    console.log(eAutomatic);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('connection error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        brandColorLookup();
    });
}

// #endregion

// #region Kevel endpoints

async function advertiserLookup(AdvertiserName) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/advertiser/search?advertiserName=${AdvertiserName}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Items.length > 0) {
                        return resolve(response.data.Items[0]);
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return resolve(0);
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function websiteLookup(websiteurl) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/fast/site?urlLike=${websiteurl}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data.Id);
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return resolve(0);
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getAdByID(adID) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/ad/${adID}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return resolve(0);
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return resolve(0);
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getKevelTemplateFields(templateID) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v2/creative-templates/${templateID}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return resolve(0);
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return resolve(0);
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getKevelTemplatesCount(selector = 0) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v2/creative-templates?pageSize=500`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        if (selector != 0) {
                            return resolve(response.data);
                        } else {
                            return resolve(response.data.totalItems);
                        }
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return resolve(0);
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return resolve(0);
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function updateCreative(creativeid, advertiserid, title, adtypeid, url, templateid, templatevalues, metadata) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const template_values_tmp = templatevalues.replace(/\\/g, '');
        const metadata_tmp = metadata.replace(/\\/g, '');
        const updateKevel = async () => {
            do {
                const data = {
                    Id: creativeid,
                    AdvertiserId: advertiserid,
                    Title: title,
                    IsActive: true,
                    AdTypeId: adtypeid,
                    Body: '',
                    Url: url,
                    TemplateId: templateid,
                    TemplateValues: JSON.stringify(JSON.parse(template_values_tmp)),
                    Metadata: JSON.stringify(JSON.parse(metadata_tmp)),
                };

                const config = {
                    method: 'put',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/creative/${creativeid}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                    data: data,
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return resolve(0);
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(e);
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        updateKevel();
    });
}

async function createCreative(advertiserID, adtypeID, title, isActive, url, templateID, templateValues, metadata) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const template_values_tmp = templateValues.replace(/\\/g, '');
        const metadata_tmp = metadata.replace(/\\/g, '');
        const createGeo = async () => {
            do {
                const data = {
                    AdvertiserId: advertiserID,
                    AdTypeId: parseInt(adtypeID, 10),
                    Title: title,
                    IsActive: isActive,
                    Url: url,
                    TemplateId: parseInt(templateID, 10),
                    TemplateValues: JSON.stringify(JSON.parse(template_values_tmp)),
                    Metadata: JSON.stringify(JSON.parse(metadata_tmp)),
                };

                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/creative`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                    data: data,
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('Creative creation error'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('connection error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        createGeo();
    });
}

async function updateAd(flightid, adid, creativeid, isactive, websiteid, startdate, enddate) {
    return new Promise((resolve, reject) => {
        let endDateISO = '2100-01-01';
        let processControl = false;
        let errorIteration = 0;
        if (enddate) {
            endDateISO = enddate;
        }
        const updateKevel = async () => {
            do {
                const data = {
                    Id: adid,
                    Creative: { Id: creativeid },
                    FlightId: flightid,
                    IsActive: isactive,
                    SiteId: websiteid,
                    StartDateISO: startdate,
                    EndDateISO: endDateISO,
                };

                const config = {
                    method: 'put',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}/creative/${adid}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                    data: data,
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('ad update error'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(e);
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        updateKevel();
    });
}

async function createAd(flightid, adid, creativeid, isactive, websiteid, startdate, enddate) {
    return new Promise((resolve, reject) => {
        let endDateISO = '2100-01-01';
        let processControl = false;
        let errorIteration = 0;
        if (enddate) {
            endDateISO = enddate;
        }
        const createKevel = async () => {
            do {
                const data = {
                    Creative: { Id: creativeid },
                    FlightId: flightid,
                    IsActive: isactive,
                    SiteId: websiteid,
                    StartDateISO: startdate,
                    EndDateISO: endDateISO,
                };

                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}/creative`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                    data: data,
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('ad update error'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(e);
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        createKevel();
    });
}

async function getFlightByID(flightid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('bad flight?'));
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return reject(new Error('flight not found'));
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(new Error('error looking for flight:' + e));
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getCampaignByID(campaignid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/campaign/${campaignid}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.Id) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('bad campaign?'));
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return reject(new Error('campaign not found'));
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(new Error('error looking for campaign:' + e));
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getAdsByFlight(flightid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}/creatives?pageSize=250`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.items) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('bad flight?'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('error getting ads for flight:' + e));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getListCountriesKevel() {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/countries`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('bad request?'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('error looking for countries:' + e));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function deleteGeoFromFlight(flightid, locationid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}/geotargeting/${locationid}/delete`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('bad request?'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('error looking for flight:' + e));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function createGeoKevel(flightid, countrycode, regioncode) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const createGeo = async () => {
            do {
                let data = {};
                if (regioncode) {
                    data = {
                        CountryCode: countrycode,
                        Region: regioncode,
                    };
                } else {
                    data = {
                        CountryCode: countrycode,
                    };
                }

                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/flight/${flightid}/geotargeting`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                    data: data,
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data.FlightId) {
                        return resolve(response.data);
                    } else {
                        return reject(new Error('geo creation error'));
                    }
                } catch (e) {
                    await delay(3000);
                    console.log(e);
                    processControl = false;
                    errorIteration = errorIteration + 1;
                    if (errorIteration == 2) {
                        return reject(new Error('connection error'));
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        createGeo();
    });
}

async function updateFlight(flightname, flightid, isactive) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        let endDateISO = '2100-01-01';
        const automaticTask = async () => {
            try {
                if (isactive == false) {
                    endDateISO = await getDateSF();
                }
                const flightSelected = await getFlightByID(flightid);
                do {
                    const data = {
                        Id: flightid,
                        PriorityId: flightSelected.PriorityId,
                        GoalType: flightSelected.GoalType,
                        RateType: RateType,
                        CampaignId: flightSelected.CampaignId,
                        StartDateISO: flightSelected.StartDateISO,
                        Impressions: flightSelected.Impressions,
                        IsActive: isactive,
                        Price: Price,
                        Name: flightname,
                        EndDate: endDateISO,
                        EndDateISO: endDateISO,
                    };

                    const config = {
                        method: 'put',
                        maxBodyLength: Infinity,
                        url: `https://api.kevel.co/v1/flight/${flightid}`,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                        },
                        data: data,
                    };

                    try {
                        const response = await axios.request(config);
                        processControl = true;
                        if (response.data.Id) {
                            return resolve(response.data);
                        } else {
                            return reject(new Error('flight update error?'));
                        }
                    } catch (e) {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(e);
                        }
                    }
                } while (processControl != true && errorIteration < 3);
            } catch (error) {
                return reject(new Error('error while bringing flight-update'));
            }
        };
        automaticTask();
    });
}

async function updateCampaign(coffername, campaignid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const automaticTask = async () => {
            try {
                const campaignSelected = await getCampaignByID(campaignid);
                do {
                    const data = {
                        Id: campaignid,
                        AdvertiserId: campaignSelected.AdvertiserId,
                        Name: coffername,
                        IsActive: true,
                    };

                    const config = {
                        method: 'put',
                        maxBodyLength: Infinity,
                        url: `https://api.kevel.co/v1/campaign/${campaignid}`,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                        },
                        data: data,
                    };

                    try {
                        const response = await axios.request(config);
                        processControl = true;
                        if (response.data.Id) {
                            return resolve(response.data);
                        } else {
                            return reject(new Error('campaign update error?'));
                        }
                    } catch (e) {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(e);
                        }
                    }
                } while (processControl != true && errorIteration < 3);
            } catch (error) {
                return reject(new Error('error while bringing campaign-update'));
            }
        };
        automaticTask();
    });
}

async function getCampaignsKevel() {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            // iterate through all the possible pages in Kevel
            const campaigns = [];
            let pageIndex = 1;
            let continueLoop = true;
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/campaign?pageSize=500&page=${pageIndex}`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        // add all the campaigns into the array
                        await asyncForEach(response.data.items, async (campaign) => {
                            campaigns.push(campaign);
                        });
                        if (response.data.page == response.data.totalPages) {
                            continueLoop = false;
                            processControl = true;
                            return resolve(campaigns);
                        } else {
                            processControl = false;
                            pageIndex++;
                        }
                    } else {
                        return reject(new Error('bad request?'));
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return reject(new Error('campaigns not found'));
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(new Error('error looking for campaigns:' + e));
                        }
                    }
                }
            } while (continueLoop && processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function getFlightsbyCampaign(campaignid) {
    return new Promise((resolve, reject) => {
        let processControl = false;
        let errorIteration = 0;
        const lookupKevel = async () => {
            do {
                const config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://api.kevel.co/v1/campaign/${campaignid}/flight?pageSize=500`,
                    headers: {
                        'X-Adzerk-ApiKey': process.env.kevelAPIToken,
                    },
                };
                try {
                    const response = await axios.request(config);
                    processControl = true;
                    if (response.data) {
                        return resolve(response.data.items);
                    } else {
                        return reject(new Error('bad request?'));
                    }
                } catch (e) {
                    // didn't found anything
                    if (e.message.includes('404')) {
                        return reject(new Error('flights not found'));
                    } else {
                        await delay(3000);
                        console.log(e);
                        processControl = false;
                        errorIteration = errorIteration + 1;
                        if (errorIteration == 2) {
                            return reject(new Error('error looking for flights:' + e));
                        }
                    }
                }
            } while (processControl != true && errorIteration < 3);
        };
        lookupKevel();
    });
}

async function checkFlightsPerCampaign(selector = 0) {
    return new Promise((resolve, reject) => {
        try {
            const logger = selector != 0 ? missingTemplatesLogger : debugflightsLogger;
            const today = new Date();
            logger.info('Starting operations, date: ' + today );
            const automaticTask = async () => {
                const templatesCount = await getKevelTemplatesCount();
                const campaigns = await getCampaignsKevel();
                if (campaigns.length > 0) {
                    logger.info('Campaigns detected: ' + campaigns.length);
                    await asyncForEach(campaigns, async (campaign) => {
                        const flights = await getFlightsbyCampaign(campaign.Id);
                        if (flights.length > 0) {
                            await asyncForEach(flights, async (flight) => {
                                if (flight.CreativeMaps.length === 0) {
                                    logger.info(`this flight is empty: ${flight.Id}`);
                                } else if (flight.CreativeMaps.length < templatesCount) {
                                    logger.info(`this flight doesn't have all the templates: ${flight.Id}`);
                                }
                                if (flight.CreativeMaps.length > templatesCount) {
                                    logger.info(`this flight has possible duplicates: ${flight.Id}`);
                                }
                            });
                        }
                    });
                }
                return resolve(true);
            };
            automaticTask();
        } catch (error) {
            return reject(error);
        }
    });
}


// #endregion

module.exports = {
    config,
    getDateSF,
    transformBrandLogoUrl,
    getAutomaticLookupTable,
    getInformationSF,
    websiteLookup,
    getTranslations,
    createAdsArray,
    returnMissingTemplatesIdsFromFlight,
    createCommaSeparatedTemplateList,
    advertiserLookup,
    getAdByID,
    getKevelTemplateFields,
    unifiedBrandDataUpdate,
    unifiedBrandDataCreate,
    mergeVariableData,
    visibleToggleVariables,
    starGenerator,
    translateOffer,
    updateCreative,
    compareDates,
    updateAd,
    createAd,
    splitCountryRegion,
    splitCountryRegionArray,
    getFlightByID,
    geoForFlights,
    geoForFlightsDOEE,
    deleteGeoFromFlight,
    clearGeoFromFlight,
    getListCountriesKevel,
    geoLookupCode,
    updateLookupTableWorkato,
    createGeoKevel,
    getAdsByFlight,
    checkAdsInsideFlight,
    updateFlight,
    createCreative,
    getCampaignByID,
    updateCampaign,
    getCampaignsKevel,
    getFlightsbyCampaign,
    checkFlightsPerCampaign,
    getKevelTemplatesCount,
    flightSearchGeoCreation,
    getBrandColors,
};
