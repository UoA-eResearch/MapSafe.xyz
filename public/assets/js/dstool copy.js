var objFile=null;       //upload encrypted file for decryption
var hash_value, full_fileName;
var minting_string;     //full_fileName + "_" + hash of encrypted filename;  
var encryptedZIPFileData_fine, encryptedZIPFileData_medium, encryptedZIPFileData_coarse; //for each encryption level, store returned encrypted blob eac time
var fileInput = null;   //uploaded file 
var isDocument = false; //if uploaded file is document
var documentExtension = null; //file extension of uploaded file
var fileName = null;    //firstpart of original filename will be used as part of encrypted filename
var levels_to_safeguard = null; //storing the user provided option

// 05-Dec-2022
// Note while computing eccryption times, we need to move the function 
// that converts the masked geojson to shapefile outside the encryption function 
var originalShapeFile, maskedShapeFile, moreMaskedShapeFile;
// save the decrypted file as global variable, from where map will be displayed
// thuis could be the masked or binned dataset
var decryptedGEOJSON; 

// 13-Dec-2022
var maskingFlag = true; //true represents masking and false represents binning.
var binnedShapeFile, moreBinnedShapeFile;
var binnedGeoJSON, binnedGeoJSON_more;

// 20 Feb 2023. Retrieve the masking flag stored in tghe encrypted volume - signifies if masking or binning was carried out
// set by default to true, meaning masking was done
var verification_masking_flag = true;

// 22 Feb 2023 for use when the most inner layer is selected for decryption, we show the original map in openlayers
var levelToDec_global;
var h3resolution, buffer_radius;
var h3resolution_more, buffer_radius_more;

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

loadSampleShapeFile = async function (){
    var outputID = "sensitiveTag", layerName = "sensitive";

    const req = new XMLHttpRequest();
    //req.open("GET", "/all_clusters_kamloops.zip", true);
    req.open("GET", "/oil_drills_north_coromandel.zip", true);
    req.responseType = "blob";   
    req.onload = (event) => {
        const blob = req.response;
        //const buffer = new Response(blob).arrayBuffer();
        //const buf = await blob.arrayBuffer();        
        //saveAs(blob, "test.zip");//the save works
        var projFileName;
        JSZip.loadAsync(blob).then(function(result){           
            myKeys = Object.keys(result.files);
            myKeys.forEach(function(i){if (i.endsWith('prj') == true ) {projFileName = i;}})
        });
        JSZip.loadAsync(blob).then(function(result){             
            projectionPromise = result.files[projFileName].async('text');
            projectionPromise.then(function(proj){projection[layerName] = proj; console.log(proj);}) //Add the projection text to the projection array and name it based on the input layer name
        });
         
        //shp accepts shapefiles and GeoJSON zipped files: https://github.com/calvinmetcalf/shapefile-js
        //kx-pup-notable-trees-SHP.zip
        shp("/oil_drills_north_coromandel.zip").then(function (geojson) {   //all_clusters_kamloops.zip
            console.log("Loading GeoJSON from sample shapefile")
            $("#" + outputID).html(layerName + ".data = " + JSON.stringify(geojson) + ";");
            //document.getElementById("tabcontent4").style.display = "none";            
            document.getElementById("sensitiveInput").disabled = true;  //user shoud not be able to upload a file
            document.getElementById("displayMap").disabled = false;     //enable the map display
            //delay(1000).then(() => console.log('ran after 1 second1 passed'));
            document.getElementById("firstnextaction-button").click();  //try to move to the next tab           
            $message = $('.tabcontent1 span.dataset_loaded_msg');       //show dataset loaded message
            $message.text('Dataset Loaded!');
            fileName = "oil_drills_north_coromandel";                   //needed for saving the ecrypted file later
            documentExtension = "zip";                                  //needed for saving the ecrypted file later
        });   
    };
    req.send(); 
}	

function preparePassphrase(str, level){
    var return_passphrase;
    if(level == 1){             //use all 15 terms for fine level
        return_passphrase = str;//passphrase = passphrase.split(' ');
    }
    else if(level == 2){         
        var terms = str.split(' ');
        //passphrase = terms[0] + ' ' + terms[1] + ' ' + terms[2] + ' ' +  terms[3] + ' ' + terms[4] + ' ' + terms[5] + ' ' +  terms[6] + ' ' + terms[7] + ' ' + terms[8]; 
        return_passphrase = terms[0];
        for (let i = 1; i < 10; i++){ return_passphrase = return_passphrase + ' ' + terms[i]; } //get the first 10 terms for medium level
    }
    else if(level == 3){  //get the first 5 terms for coarse level
        var terms = str.split(' ');
        return_passphrase = terms[0];
        for (let i = 1; i < 5; i++){ return_passphrase = return_passphrase + ' ' + terms[i];  }                 
    }
    return_passphrase = return_passphrase.trim();  //making sure preceding and trailing spaces are removed
    console.log("Passphrase for encryption/decryption level : " + level + " = (" + return_passphrase + ")");
    return return_passphrase;
}

//delete later

function returnBlob(obj){
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    const blob = new Blob([bytes], {
        type: "application/json;charset=utf-8"
    });
    return blob
} 

var saveJson = function(obj, fileName) {
	var str = JSON.stringify(obj);
	var data = encode( str );

	var blob = new Blob( [ data ], {
		type: 'application/octet-stream'
	});
	
	var url = URL.createObjectURL( blob );
	var link = document.createElement( 'a' );
	link.setAttribute( 'href', url );
	link.setAttribute( 'download', fileName );
	var event = document.createEvent( 'MouseEvents' );
	event.initMouseEvent( 'click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
	link.dispatchEvent( event );
} 

var encode = function( s ) {
	var out = [];
	for ( var i = 0; i < s.length; i++ ) {
		out[i] = s.charCodeAt(i);
	}
	return new Uint8Array( out );
} 

// main function to zip the map and encrypt implements three-level volume encryption
//async function multiLevelEncrypt(maskedData_string, maskedMedData_string, startTimeENC){ 
async function multiLevelEncrypt(startTimeENC){ 
    //var startTimeENC = new Date();
    
    //just to show user the spinner, we delay half second - spinner doesnt work without this wait facility
    await new Promise(resolve => setTimeout(resolve, 500));

    //we remove the layer as JSON.stringify was not working 
    //If you check out the full masked object and compare masked.data to masked.reprojected, you'll see masked.data has that .layer object added. This contains the circular reference that breaks the JSON serializer. 
    //If you just drop that layer object that JSON.stringify works as expected
    delete masked.data.layer;   //delete masked.reprojected.layer;
    console.log('masked.data' + masked.data)
    //console.log('JSON.stringify(masked.data)' + JSON.stringify(masked.data));
    /*
    var dataGJ = JSON.stringify(masked.data); //masked.reprojected); 
    var blobGJ = new Blob( [ dataGJ ], {
		type: 'application/octet-stream'
	});
    */

    //for storing as geojson (blobGJ_more)
    delete maskedMore.data.layer;
    console.log('maskedmore.data' + maskedMore.data)
    //console.log('JSON.stringify(masked.data)' + JSON.stringify(masked.data));
    //var dataGJ_more = JSON.stringify(maskedMore.data);
    //var blobGJ_more = new Blob( [ dataGJ_more ], {	type: 'application/octet-stream' });
    
    //masked reprojected works
    //var result = saveShapeFile(maskedMore.data,"maskedMore");
    //var result = saveShapeFile(masked.reprojected,"masked");

    /*
    //get level to encrypt											
    levels_to_safeguard = document.querySelector('input[name="vol_encrypt"]:checked').value;
    //when the most inner layer is selected for encryption, we show the original map in openlayers
    //levelToEnc_global = levelToEnc;
    console.log('level to sagfeguard = ' + levels_to_safeguard);
    //levels_to_safeguard = 2;
    */
    //return;

    console.log('Encryption levels to sagfeguard = ' + levels_to_safeguard);    
    console.log("Beginning Encryption: ");
    //var originalmap_jsonString = JSON.stringify(sensitive.data, circularReplacer());
    
    //for the below functions, currently we are using the same passphrase - from textbox in the form. This will change

    //Volume encryption
    //In all cases, encrypt and include this first level containiong the 'original' dataset, 
    //1st level wil be the most inner, 2nd will be inner, and 3rd outer
    if (levels_to_safeguard <= 3) {
        // LEVEL 1. = fine-level = innermost level zip made first. if its level 1, add these files and send zip for encryption and then it will be used as as part of the next zip file
        console.log('Level 1 begins');
        var zipLevel1 = new JSZip();
        //we use shapefile instead
        //26-April-23 lets not include the geojson here because of the time take - and its not needed 
        //zipLevel1.file("original.geojson", originalmap_jsonString);  //add original map file to zip file
        //originalShapeFile = returnShapeFile(JSON.parse(originalmap_jsonString) ); //sensitive.data); 
        //zipLevel1.file("originalShapeFile.zipR",originalShapeFile); //returnShapeFile
        zipLevel1.file("originalShapeFile.zipR",original_shapefile); //returnShapeFile
        if(maskingFlag){
            zipLevel1.file("Metadata.txt", //above has values here
                    "\nNote this is the fine level (level 1) cntaining the original map" +
                    "\nThis level contains the masking parameters of Level 2 \nMinimum Distance: " + minimum_Distance + " metres\nMaximum Distance: " + maximum_Distance + " metres"
                    );
        }
        else{
            zipLevel1.file("Metadata.txt", //above has values here
                    "\nNote this is the fine level (level 1) containing the original map" +                
                    "\n\nThis level contains the binning parameters of Level 2 \nH3 Resolution: " + h3resolution  + "\nBuffer Radius: " + buffer_radius
                    );
        }
        //zipLevel1.file("folder/placeholderfile.txt", "placeholderfile in folder");
        
        //The zip file is now ready in a blob format. Need to encrypt and save it. encrypt this zip file again before saving
        //we have to encrypt it using certain number of terms in passphrases
        var encryptedZipFileData_Level1, encryptedZipFileData_Level2, encryptedZipFileData_Level3;
        
        try { 
            encryptedZipFileData_Level1 = await zip_callEncryption(zipLevel1, 1, levels_to_safeguard, startTimeENC); // Await for the first function to complete
        }
        catch (error) { console.error(error); }  
    }
    
    //If user wants level 2 as well 
    if (levels_to_safeguard >= 2) { //level 2 is be included in levels 2 and 3
        // Level 2. Medium-level zip should contain the medium level map, metadata and encrypted zip of fine-level (level 1)  - then zip it and then encrypt
        // parameters .... masking distance, angle
        console.log('Level 2 begins');
        var zipLevel2 = new JSZip();    
        zipLevel2.file("fine_level.enc", encryptedZipFileData_Level1);   //add the encrypted fine-level zip containing the map and metadata 
        //05-Dec-2022 we use shapefile instead
        //zipLevel2.file("mediumMap_maskedOnceUsingOneOffset.map", maskedData_string);      //map is masked using one offset      
        //maskedShapeFile = returnShapeFile(masked.reprojected); 
        if(maskingFlag){  //if user has chosen masking option, as his last option while on the masking tab
            //26-April-23 lets not include the shapefile here because of the time take - and its not needed 
            //zipLevel2.file("masked.geojson", blobGJ); //returnBlob(masked.data)); //returnShapeFile
            //delete masked.data.layer; //not sure if we need this line of code
            delete masked.reprojected.layer;             
            maskedShapeFile = returnShapeFile(masked.reprojected); //masked.data);                         
            zipLevel2.file("maskedShapeFile.zipR", maskedShapeFile); //returnShapeFile
            zipLevel2.file("Metadata.txt",
                "\nNote this level contains the medium level map - which is masked once, the masking parameters of which is in one level inside, i.e. the innermost  level) "
                + "This level contains the masking parameters of outer most level - Level 3 (Coarse) "
                + "\nMinimum Distance more: " + maximum_Distance + " metres\nMaximum Distance more: " + maximum_Distance_more + " metres"   //ignore the `Med' in variable names - will change 
                );
        }
        else{ //if user has chosen binning option, as his last option while on the masking tab
            var bgj = JSON.stringify(binnedGeoJSON)
            console.log('binnedGeoJSON: ' + bgj)            
            //26-April-23 lets not include the geojson here because of the time take - and its not needed 
            zipLevel2.file("binned.geojson", bgj); //blobBin); //returnBlob(masked.data)); //returnShapeFile
            //binnedShapeFile = returnShapeFile(binnedGeoJSON);
            //zipLevel2.file("binnedShapeFile.zipR", binnedShapeFile); //returnShapeFile

            zipLevel2.file("Metadata.txt",
                "\nNote this level contains the medium level map - which is binned once, the binning parameters of which is in one level inside, i.e. the innermost  level "
                + "This level contains the binning parameters of outer most level - Level 3 (Coarse) "
                + "\nH3 Resolution: " + h3resolution_more + "\nBuffer Radius: " + buffer_radius_more     //ignore the `Med' in variable names - will change        
                );
        }    
    
        try {
            encryptedZipFileData_Level2 = await zip_callEncryption(zipLevel2, 2, levels_to_safeguard, startTimeENC); //second parameter is the level 
        }
        catch (error) { console.error(error);  } 
    }

    //If user wants level 3 as well
    if (levels_to_safeguard == 3) {
        console.log('Level 3 begins'); //Most outer layer
        // 3. Coarse-level zip contains the coarse level map, metadata and encrypted zip of medium-level - then zip the resultant file and encrypt it
        var zipLevel3 = new JSZip();
        //add the encrypted fine level zip containing the data/map and metadata 
        zipLevel3.file("medium_level.enc", encryptedZipFileData_Level2);   //add the encrypted medium-level zip containing the map and metadata 
        //05-Dec-2022 we use shapefile instead
        //zipLevel3.file("coarseMap_maskedUsingTwoOffsets.map", maskedMedData_string);  //map is masked using two offsets
        //$$$$ TEMP - we just use the masked instead of maskedMed when that would be ready - probably soon
        //moreMaskedShapeFile = returnShapeFile(masked.reprojected); 
        //16 Feb 2023
        if(maskingFlag){  //if user has chosen masking option, as his last option while on the masking tab            
            //zipLevel3.file("moreMaskedShapeFile.geojson", returnBlob(masked.data)); //returnShapeFile
            //26-April-23 lets not include the geojson because of the time take - and its not needed 
            //zipLevel3.file("more_masked.geojson", blobGJ_more); //geojson with more masked data //returnBlob(masked.data)); //returnShapeFile
            //delete maskedMore.reprojected;
            moreMaskedShapeFile = returnShapeFile(maskedMore.reprojected);  //more masked data
            zipLevel3.file("moreMaskedShapeFile.zipR", moreMaskedShapeFile); //returnShapeFile
            zipLevel3.file("metadata.txt",             
                    + "\nNo Masking parameters here. "
                    + "\nSince this outer level contains the 'more' masked map - of which the masking parameters is within one level inside - middle level");  
        }
        else { //if user has chosen binning option, as his last option while on the masking tab
            //FOR THE MOMENT WE USE THE SAME BINNED MAP AS THE MIDDLE LAYER
            var bgjm = JSON.stringify(binnedGeoJSON_more);
            console.log('morebinnedGeoJSON: ' + bgjm)
            /* var blobBin = new Blob( [ binnedGeoJSON_more ], {
                type: 'application/octet-stream'
            }); */
            //26-April-23 lets not include the geojson here because of the time take - and its not needed
            zipLevel3.file("binned.geojson", bgjm); //blobBin); //returnBlob(masked.data)); //returnShapeFile            
            //moreBinnedShapeFile = returnShapeFile(binnedGeoJSON_more);
            //zipLevel3.file("binnedShapeFile.zipR", moreBinnedShapeFile); //returnShapeFile

            zipLevel3.file("metadata.txt",             
                    + "\nNo Binning parameters here. "
                    + "\nSince this outer level contains the 'more' binned map - of which the binning parameters is within one level inside - middle level");
        }
                            //add medium level data/map
        
        //20-Feb-2023 variable which signifies if use has carieed out masking of binning while safegarding
        //this will tell the verification process to show a masking (openlayers) or binning (mapbox) map canvas
        //maskingFlag = true, wil signify masking was carried out, else binning 
        //console.log('maskingFlag' + maskingFlag)
        zipLevel3.file("safeguardingApproach.txt", maskingFlag + "\n");
        
        //encrypt this zip file again before saving. Note, we have to encrypt it using certain number of terms in passphrases
        
        //create a zip file of the coarse data and encrypt it. At this level, the encrypted file will be automatically saved. See code inside fn.
        try {                                                              //current_level = 3
            encryptedZipFileData_Level3 = await zip_callEncryption(zipLevel3, 3, levels_to_safeguard, startTimeENC);
        }
        catch (error) { console.error(error); }
    }

    //stop the spinner
    $(".loading-icon").addClass("hide");
    $(".button").attr("disabled", false);
    $(".btn-txt").text("Encrypt");    

    //endTimeENC = new Date();
    //executionTimeENC = ((endTimeENC - startTimeENC) / 1000);
    //console.log("Three levels of encryption complete. Exceution Time: " + executionTimeENC);   
}

// This function takes the zip file object, generates a blob out of it, encrypts it and return its 
// syntax based on ``doJob'' example from  https://techbrij.com/javascript-async-await-parallel-sequence
async function zip_callEncryption(zipFile, level, levels_to_safeguard, startTimeENC) {
    return new Promise((resolve, reject)  => {
        console.log('Processing start.')             
        var encryptedZipFile, encryptedZipFileData;
        var downloadFile = false;
        if(level == levels_to_safeguard) downloadFile = true;  //if(level == 3) downloadFile = true;
        //create a zip file of the coarse data and then save it    
        //Add the deflate option: https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html
        zipFile.generateAsync({type: "blob", compression: "DEFLATE"}, )  //https://stuk.github.io/jszip/
            .then(function (content) {  
                console.log('Processing middle.')           
                var arrayBuffer, fileReader = new FileReader();        
                //this function is needed as we want to first create a file using the blob and then encrypt that 
                //You can use FileReader to read the Blob as an ArrayBuffer
                fileReader.onload = function (event) { 
                    arrayBuffer = fileReader.result;
                    //console.log("here fileReader.result: " + fileReader.result);
                    encryptedZipFile = encryptData(false, fileReader.result, downloadFile, level, startTimeENC);  //data passed is in arraybuffer format, but later should now be converted to blob again
                    encryptedZipFile.then((value) => {                            
                        encryptedZipFileData = value
                        resolve(encryptedZipFileData);
                    }); 
                };
                //actually, accoding to documentation, this gets called almost as soon as fileReader has been created
                fileReader.readAsArrayBuffer(content); //content = blob
                fileReader.result; // also accessible this way once the blob has been read                    
            }); 
        var str = JSON.stringify(encryptedZipFileData, circularReplacer());      
    })    
  }

//pass the 'masked_reprojected'
async function generateShapeFileFromGeoJSON(geoJSON, v_fileName){   
    var options = {
      //folder: v_fileName,
      types: {
          point: v_fileName, polygon: v_fileName, line: v_fileName
      }
    }
    var shpBuffer = shpwrite.zip(geoJSON, options); 
    console.log('shapeFile ' + shpBuffer)
    return shpBuffer;
  }

//05-Jun-2022. Converts and saves the returned shapefile from generateShapeFileFromGeoJSON() function, used to download the masked data
async function saveShapeFile(geoJSON, option){
    var shpBuffer = await generateShapeFileFromGeoJSON(geoJSON, fileName); 
    var base64String = Uint8Array.from(window.atob(shpBuffer), (v) => v.charCodeAt(0));
    var shapeFileBlob = new Blob([ base64String ], {type:"application/zip"});
    saveAs(shapeFileBlob, option + "_" + fileName + ".zip");   // see FileSaver.js
}

//05-Dec-2022. return shapefile from geojson
async function returnShapeFile(geoJSON){
    var shpBuffer = await generateShapeFileFromGeoJSON(geoJSON, fileName); 
    var base64String = Uint8Array.from(window.atob(shpBuffer), (v) => v.charCodeAt(0));
    var shapeFileBlob = new Blob([ base64String ], {type:"application/zip"});
    return shapeFileBlob;
    //saveAs(shapeFileBlob, fileName + ".zip");   // see FileSaver.js
}

//26-Apr-23 Verification main function

//recursive unzip, decrypt and verify. keep on decrypting the encrypted file until we reach the level required by the user. Note encrypted file would be of a zip 
//level 3 = coarse, level 2 = medium, level 1 = fine. Fine indside medium which would be inside coarse
async function multiLevelDecrypt(v_objFile, levelToDecryptTo, currentLevel){ // when this function is called at first the value for `currentLevel' should be 1, then when called recursively it increases
    // when this function is called at first the value for `currentLevel' should be 1, then when called recursively it increases
    //console.log("Inside multiLevelDecrypt function ");
    console.log("#### Decryption started. Level To decrypt to = "+  levelToDecryptTo + " currentLevel " + currentLevel);
    
    //just to show user the spinner, we delay half second - spinner doesnt work without this wait facility
    await new Promise(resolve => setTimeout(resolve, 500));

    var startTimeDEC = new Date();
    console.log("Multi Level Decryption: Started " + startTimeDEC);

    //get content from file object. The `big encrypted zip file'
    var cipherbytes = await readfile(v_objFile)
    .catch(function(err){
        console.error(err);
    }); 
    
    var encrypted_maskedData = new Uint8Array(cipherbytes);
  //  console.log("Original encrypted_maskedData: " + encrypted_maskedData);  //get file data 
    //console.log("Console: Uploaded encrypted masked data for decryption: " + convertStringToArrayBuffer(encrypted_maskedData));
    
    //No longer needed
    //var jsonString = JSON.stringify(encrypted_maskedData, circularReplacer());
    //console.log(jsonString);
    
    var downloadFile = false;
    if (currentLevel == levelToDecryptTo)
        downloadFile = true;

    //1. Compute and Verify hash of `big encrypted zip file'. First would come the Coarse level     
    //(a) Compute Hash values for the bigfile - coarse level. Once computed, this will be used in the verification screen
    //First and we want to verify the encrypted file.
    //console.log("Computing Hash for verification:");
    //let encryptedmasked_data_hash_value = await digestMessageHex(jsonString); //originalData_string);
    //console.log("encryptedmasked_data_hash_value: " + encryptedmasked_data_hash_value);
    //let masked_data_hash_value = await digestMessageHex(maskedData_string);
    //console.log("masked_data_hash_value: " + masked_data_hash_value);
    //hash_value = encryptedmasked_data_hash_value; //set the global variable   

    //first decrypt the file data of the `big encrypted zip file'. Remember we would be passed with a file with a '.enc' extension
    //(b) Decrypt. We need to decrypt this coarse level first and store it in a variable ..02-08-2021
    //coarse level decryption
    //console.log("Decrypting Now:");
    var decrypted_file_data;
    //try{    
        decrypted_file_data = await decryptData(v_objFile, encrypted_maskedData, levelToDecryptTo, currentLevel, downloadFile, startTimeDEC); //will automatically use the 'objFile' global variable
    //}
    //catch(err){
    //    console.log("Error Now:");
    //    return false;
    //}

    if (!decrypted_file_data){
        console.log("Returning without unzipping "); 
        return;
    }

    //let original_file_hash_value = await digestMessageHex(decrypted_file_data);
    //console.log("original_file_hash_value: " + original_file_hash_value);    
    //console.log("decrypted_file_data: " + decrypted_file_data); 

    //`big encrypted zip file' is encrypted. So here we Decrypt it into file content into fileobject so we can iterate over each file
    var file = new File([decrypted_file_data], "decrypted.txt", {
        type: "text/plain",
    });
    v_objFile = file; //assign to variable used below
       
    //save decrypted file (in zipped form) to see the details in the file at this point
    //saveAs(v_objFile, "decryptedVolume_"+currentLevel+".zip");
    
    //From the decrypted zip file object, we unzip each file 
    console.log("Unzipping now: "); 
    var jsZip = new JSZip();
    //var fileNum = 0;
    jsZip.loadAsync(v_objFile).then(function (zip) {
        Object.keys(zip.files).forEach(function (filename){
            //now we iterate over each zipped file 
            zip.files[filename].async('string').then(function (fileData){
                console.log("\t filename: " + filename);                             
                
                //get the maskingflag - This code will be excuted in all circumstances, as we decrypt beginning from the outer later
                if (filename  ===  'safeguardingApproach.txt') {
                    verification_masking_flag = fileData;  //set the masking flag
                    console.log('fileData: ' + fileData)
                } 
                
                //if we found the shapefile file and this is the level of which we want to show/decrypt the volume                
                //using .zipR to differentiate between the zip file containing the next level and the shapefile
                if (filename.endsWith('.zipR') == true && currentLevel == levelToDecryptTo){ //&& currentLevel == levelToDecrypt){
                    console.log("\t file to decrypt: " + filename); // decrypt the file here //projFileName = i;                        
                    //we decrypt the encrypted volume at that level, display and allow user to save the decrypted file                    
                    console.log("\t For verification. We can display the map here");                            
                    //create a file out of the `decrypted_file_data' variable
                    decryptedGEOJSON = fileData;
                    //08-dec-2022 we use the same function. never mind the paramaters 
                    //we just has to update the fileInput parameter and later the displayMap() fun will use that variable to display
                    //console.log("Calling loadShapeFile")
                    //loadShapeFileFromVariable(zip.files[filename], "sensitiveTag", "sensitive")
                    
                    zip.file(filename).async('blob').then( (blob) => { 
                        console.log("Downloading File")                           
                        //saveAs(blob, filename);  
                        //const buf = blob.arrayBuffer();
                        const buffer = new Response(blob).arrayBuffer();                        
                        (async () => {
                            //const blob = new Blob(['hello']);
                            const buf = await blob.arrayBuffer();
                            console.log("buf.byteLength: " + buf.byteLength ); // 5
                            
                            //06-Jan-2023, create geojson from shapefile for diplay during verification. We should only create a geojson from shapefile, like below. 
                            //However, as shapefile is a zip file, while decrypting there are two sets of zip files (the shapefile and 
                            //the (decrypted) zip file). Thus, until we find a way to differentiate between the two, we have to store a geojson along for display later on
                            shp(buf).then(function (geojson) {                                
                                sensitive.data  = JSON.stringify(geojson); //removeEmpty(JSON.stringify(geojson, undefined, 4)) // first use JSON.stringify ); 
                                //console.log('sensitive.data 2 '+ sensitive.data )
                                $("#sensitiveTag").html("sensitive.data = " + sensitive.data + ";"); // fileData + ";"); //JSON.stringify(geojson) + ";");  
                                decryptedGEOJSON = sensitive.data;
                                console.log("Loaded geojson"); // + JSON.stringify(geojson));
                            });
                          })();  
                    }); 
                    console.log("Called loadShapeFile")     
                }
                //if masking was performed --- and even to show the original
            /*    if ( (filename.endsWith('masked.geojson') == true || filename.endsWith('original.geojson') == true) 
                        && currentLevel == levelToDecryptTo){
                    zip.file(filename).async('string').then( (str) => {    
                        console.log('Masking: Found geoJSON in filename: '+filename+' while encryption Level: ' + currentLevel);
                        $("#sensitiveTag").html("sensitive.data = " + str + ";"); // fileData + ";"); //JSON.stringify(geojson) + ";");    
                        decryptedGEOJSON = str;
                    });
                }
            */  //if binning was performed
                if (filename.endsWith('binned.geojson') == true && currentLevel == levelToDecryptTo){
                    zip.file(filename).async('string').then( (str) => {    
                        console.log('Binning: Found geoJSON in filename: '+filename+' while encryption Level: ' + currentLevel);
                        decryptedGEOJSON = str;                        
                    });
                }               
                //we look for the encrypted volume. It has an `.enc' file extension. 
                //keep going one level down for decrypt if this is not the right level of decryption 
                else if (filename.endsWith('.enc') == true && currentLevel != levelToDecryptTo) //havent reaced the required level, we keep on decrypting
                {
                    //console.log("Calling multiLevelDecrypt function again");
                    currentLevel = currentLevel - 1; // decrement the current level
                    //decrypt ... https://stackoverflow.com/questions/65491311/extracted-files-from-zip-using-jszip-return-plain-text-files
                    zip.file(filename).async('blob').then( (blob) => {                            
                        //call the recursive decryption 
                        multiLevelDecrypt(blob, levelToDecryptTo,currentLevel, startTimeDEC); 
                    });                        
                }
            })           
        })
    }).catch(err => window.alert(err)) 

    //stop the spinner
    $(".loading-icon").addClass("hide");
    $(".button").attr("disabled", false);
    $(".btn-txt").text("Encrypt"); 

}

//11-Dec-2022 .. http://jsbin.com/raxutonaho/1/edit?html,js,console
function removeEmpty(obj) {
    Object.keys(obj).forEach(function(key) {
      (obj[key] && typeof obj[key] === 'object') && removeEmpty(obj[key]) ||
      (obj[key] === '' || obj[key] === null) && delete obj[key]
    });
    return obj;
  };

//This is the main encryption function that does the encryption 
//Parameters: the 'file_contents' can be the zipped map file or a document
async function encryptData(isDocument, file_contents, downloadFile, level, startTimeENC) {
    //if document or map we read the file content
    var plaintextbytes = new Uint8Array(file_contents);
//    console.log("isDocument plaintextbytes:" + plaintextbytes );
        
    //#### main idea is to save it this way first
    //saveAs(zip_file_contents, "example.zip");

    //get passphrase
    var mainPassphrase = document.getElementById("passphraseOutput").value;
    console.log("Main passphrase: " + mainPassphrase);

    var passphrase = preparePassphrase(mainPassphrase, level);  //prepare/reduce passphrase for the different levels
    console.log("Passphrase to use for decryption: " + passphrase);
    //
    var pbkdf2iterations=10000;
    var passphrasebytes=new TextEncoder("utf-8").encode(passphrase);
    //console.log('passphrasebytes' + passphrasebytes);
    var pbkdf2salt=window.crypto.getRandomValues(new Uint8Array(8));
    console.log('pbkdf2salt' + pbkdf2salt);

    var passphrasekey=await window.crypto.subtle.importKey('raw', passphrasebytes, {name: 'PBKDF2'}, false, ['deriveBits'])
        .catch(function(err){
            console.error(err);
        });
    console.log('passphrasekey imported');

    var pbkdf2bytes=await window.crypto.subtle.deriveBits({"name": 'PBKDF2', "salt": pbkdf2salt, "iterations": pbkdf2iterations, "hash": 'SHA-256'}, passphrasekey, 384)
        .catch(function(err){
            console.error(err);
        });
    console.log('pbkdf2bytes derived');
    pbkdf2bytes=new Uint8Array(pbkdf2bytes);

    keybytes=pbkdf2bytes.slice(0,32);
    ivbytes=pbkdf2bytes.slice(32);

    var key=await window.crypto.subtle.importKey('raw', keybytes, {name: 'AES-GCM', length: 256}, false, ['encrypt'])
        .catch(function(err){
            console.error(err);
        });
    console.log('key imported');

    var cipherbytes=await window.crypto.subtle.encrypt({name: "AES-GCM", iv: ivbytes}, key, plaintextbytes)
        .catch(function(err){
            console.error(err);
        });

    if(!cipherbytes) {
        console.error("Error encrypting file.  See console log.");
    }

    cipherbytes=new Uint8Array(cipherbytes);

    //cipherbytes=new Uint8Array(cipherbytes);
    var resultbytes=new Uint8Array(cipherbytes.length+16)
    resultbytes.set(new TextEncoder("utf-8").encode('Salted__'));
    resultbytes.set(pbkdf2salt, 8);
    resultbytes.set(cipherbytes, 16);
    
    //do we need this line of code below?
    var blob = new Blob([resultbytes], {type: 'application/download'}); //resultbytes instead of plaintext    
    
    endTimeENC = new Date();
    executionTimeENC = ((endTimeENC - startTimeENC) / 1000);
    console.log("Level " + level + " encryption complete. Exceution Time: " + executionTimeENC);

    //we only download/display link when the level is right
    if(downloadFile){
        //save the blob file
        //https://github.com/eligrey/FileSaver.js/issues/357
        //var fileData2 = JSON.stringify(resultbytes, undefined, 4); // first use JSON.stringify 
        var blob2 = new Blob([resultbytes],{type: 'text/plain'} ); // save as Blob 
        
        //compute hash of the final encrypted volume file (level 3).
        //https://stackoverflow.com/questions/21761453/create-sha-256-hash-from-a-blob-file-in-javascript
        const hashHex = await getHash("SHA-256", blob2)
        hash_value = hashHex;          //finally UPDATE THE GLOBAL VARIABLE 'HASH'
        console.log('hashHex: ' + hashHex); 
        hashOutput.textContent = hash_value;  //display_hash() //display hash 
        
        full_fileName = fileName + "." + documentExtension + ".enc";  //we should put in the zip extension - check 'documentExtension' - why same code for both cases?
        //the string to be minted is stored as a global variable
        minting_string = full_fileName + "_" + hashHex;

        saveAs(blob2, full_fileName); 
        console.log('encrypted file saved: ' + full_fileName)         
    }   
    encryptedFileData = blob;   //do we need this line of code ??
    return Promise.resolve(resultbytes);
}

//17-10-2021. lets try a new function
///https://stackoverflow.com/questions/21761453/create-sha-256-hash-from-a-blob-file-in-javascript
async function getHash(algorithm, data) { 
    //console.log("inside getHash() function");
    const main = async (msgUint8) => { // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
      const hashBuffer = await crypto.subtle.digest(algorithm, msgUint8)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    }

    //check if data is blob, processes and returns
    if (data instanceof Blob) {
      //console.log("data instanceof Blob");
      const arrayBuffer = await data.arrayBuffer()
      const msgUint8 = new Uint8Array(arrayBuffer)
      return await main(msgUint8)
    }
    const encoder = new TextEncoder()
    const msgUint8 = encoder.encode(data)
    return await main(msgUint8)
  } 

// https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
// is also on msdn
function readfile(file){
    return new Promise((resolve, reject) => {
        var fr = new FileReader();
        fr.onload = () => {
            resolve(fr.result )
        };
        fr.readAsArrayBuffer(file);
    });
}

function parseZipFile(zipFile) {
    console.log('Parsing zip file ' + zipFile.name + ' ...');
    console.log(' -> data ' + zipFile.data);

    JSZip.loadAsync(zipFile).then(function (zip) {
        Object.keys(zip.files).forEach(function (filename) {
            zip.files[filename].async('string').then(function (fileData) {
                console.log(fileData) // These are your file contents
            })
        })
    })
}

// This function is not used for opening files all the time. It is only used in the case when user is trying on directly encrypt 
// i.e. line 186 in index.html <p><strong>Optional: Encrypt file directly</strong> without masking.
// It is also used for decryption
var openFile = function(event) {
    console.log("File Uploaded");
    var input = event.target;
    var reader = new FileReader();
    reader.onload = function(){
        var arrayBuffer = reader.result;
        console.log(arrayBuffer.byteLength);
    };    
    objFile = input.files[0]; //this is the main variable which is populated

    //file validation for the verification flow (2). Parameter is needed as ....why??? $$$$ 
    console.log("File Validation");
    fileValidation(2); 

    //here we call to compute hash and store the resultant value
    compute_hash();
    //display_hash();
};

// Main function used to decrypt files     //currentLevel
async function decryptData(objFile, encryptedBytes, levelToDecryptTo, currentLevel, download, startTimeDEC){
    console.log("Decryption");
    //Can also read the File directly. Its in another function now
    
    var cipherbytes = encryptedBytes; //

    //get passphrase
    var mainPassphrase = document.getElementById("txtDecpassphrase").value;
    console.log("Main passphrase: " + mainPassphrase);

    var passphrase = preparePassphrase(mainPassphrase, currentLevel);  //prepare/reduce passphrase for the different levels
    //console.log("Chosen passphrase: " + passphrase);

    var pbkdf2iterations=10000;
    var passphrasebytes=new TextEncoder("utf-8").encode(passphrase);
    var pbkdf2salt=cipherbytes.slice(8,16);

    var passphrasekey=await window.crypto.subtle.importKey('raw', passphrasebytes, {name: 'PBKDF2'}, false, ['deriveBits'])
        .catch(function(err){
            console.error(err);

        });
    console.log('passphrasekey imported');

    var pbkdf2bytes=await window.crypto.subtle.deriveBits({"name": 'PBKDF2', "salt": pbkdf2salt, "iterations": pbkdf2iterations, "hash": 'SHA-256'}, passphrasekey, 384)
        .catch(function(err){
            console.error(err);
        });
    console.log('pbkdf2bytes derived');
    pbkdf2bytes=new Uint8Array(pbkdf2bytes);

    keybytes=pbkdf2bytes.slice(0,32);
    ivbytes=pbkdf2bytes.slice(32);
    cipherbytes=cipherbytes.slice(16);

    var key=await window.crypto.subtle.importKey('raw', keybytes, {name: 'AES-GCM', length: 256}, false, ['decrypt'])
        .catch(function(err){
            console.error(err);
            //return false;
        });
    console.log('key imported');

    var decryptedData, error = false;

    var plaintextbytes=await window.crypto.subtle.decrypt({name: "AES-GCM", iv: ivbytes}, key, cipherbytes)
        .catch(function(err){
            console.error(err);
            console.log("Error during Decryption");
            error = true;
            //return false;
            //early may 2023 - as we encounter error, we try decrypting with one level down
            //13-May-2023 we also make sure that if user is trying to decrypt to middle or outer level, and those do not exist, we inform the user
            //so we take the levelToDecryptTo and 
            // if its outer level (level 3) and it does not exist -> we show error and return - with no further processing
            if (currentLevel == 3 && levelToDecryptTo == 3){
                alert('Either the passphrase is incorrect or the encrypted volume does not contain the outer level with the coarse dataset');  
                return false;
            }
            // same for middle level
            else if (currentLevel == 2 && levelToDecryptT0 == 2){  
                alert('Either the passphrase is incorrect or the encrypted volume does not contain the middle level with the medium dataset')
                return false;  
            }
            else if (currentLevel == 1 && levelToDecryptT0 == 1){  
                alert('The passphrase is incorrect')
                return false;  
            }
            //For levels 3 and 2, we havent yet reached the leveltodecryptto that the user wants
            //But we dont do this for level 1, as there is no further we can go
            if ((currentLevel != levelToDecryptTo)  && currentLevel == 3 || currentLevel == 2) //just to make sure we dont keep on going decrypting and just try it two more times (middle and inner level)
            {
                console.log("Trying to encrypt the next (inner) level ");
                decryptedData = multiLevelDecrypt(objFile, levelToDecryptTo, currentLevel - 1, download, startTimeDEC);  
                //return false;
            }            
            //multiLevelDecrypt(objFile, levelToDec, currentLevel = 1);
        });

    /* if(!plaintextbytes) {
        console.log("Error during Decryption b");
    } */
        
    if(download && (error == false)) { //we only download/display link at the right level
        //save the blob file https://github.com/eligrey/FileSaver.js/issues/357   
        console.log("#### Download Begins");
        endTimeDEC = new Date();
        executionTimeDEC = ((endTimeDEC - startTimeDEC) / 1000);
        console.log("Three levels of decryption complete. Exceution Time: " + executionTimeDEC);        
        var blob = new Blob([plaintextbytes],{type: 'text/plain'} ); // save as Blob 
        var fileName2 = fileName + "_level"+ currentLevel +".zip";
        decryptedZIPFile = blob; //save the decrypted volume/ zip file as global variable, from where map will be displayed
        saveAs(blob, fileName2); 
        console.log('Decrypted file Level'+ currentLevel + 'saved, filename: ' + fileName2)  
    }
    return plaintextbytes;
}

function saveStaticDataToFile(ha, filename) {
    var blob = new Blob([ha],
        { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
}

//used to display hash 
function display_hash() {
    console.log("Displaying file: " + full_fileName + " hash: " + hash_value); 
    hashOutput.textContent = hash_value; 
    document.getElementById("mintButton").disabled = false;
    document.getElementById("download-trans").disabled = false;
}

//03-12-2022 Display has of encrypted volume
async function compute_hash(){
    console.log("Computing Hash: ");
    var hashHex;

    if(fileInput.files[0] == undefined) {
        return ;
    }
    var filename = fileInput.files[0].name;
    // var filesize = fileInput.files[0].size;
    var reader = new FileReader();
    reader.onload = function(ev) {
        console.log("File", filename, ":");
        // https://techoverflow.net/2021/11/26/how-to-compute-sha-hash-of-local-file-in-javascript-using-subtlecrypto-api/
        crypto.subtle.digest('SHA-256', ev.target.result).then(hashBuffer => {
            // Convert hex to hash, see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
            console.log('HashHex of Encrypted Volume : ' + hashHex) 
            hash_value = hashHex;
            hashOutput.textContent = hash_value;  //display hash 
        }).catch(ex => console.error(ex));
    };
    reader.onerror = function(err) {
        console.error("Failed to read file", err);
    }
    reader.readAsArrayBuffer(fileInput.files[0]);

    //finally UPDATE THE GLOBAL VARIABLE 'HASH'    
    hash_value = hashHex;     console.log('hash_value ' + hash_value)
}

//09-11-2021...save transaction receipt								
function saveReceipt(hash_value, tx_url, fromAddr, tx_hash, gas_price){
    /*
    Before Clicking the submit mint
        Should the user choose the minting priorty? low, medium, or high?
        Here are the fees: 
            gas fees:     priority fees:     our charges: 

    After clicking the submit mint
        Here is a record of the transaction
        You have paid us X.XX for the trsnaction
        We expect that your transaction will be put/minted on the blockchain in X amount time.
        The transaction number is
        You can find the hash o fthe encrypted file stpored on the bloachain at the following address, 
        once its minted

    Save this record as a pdf file.
    */
 //   var txnNumber = 32;
 //   var hash_value = '@bf91df556df49c5da05b51ac97494c2c74e9a13aaa26270695f609136501f816';
    //import { jsPDF } from "jspdf";  
    // Default export is a4 paper, portrait, using millimeters for units
    console.log('saving Transaction Receipt as PDF');

 //   var tx_url = 'https://goerli.etherscan.io/tx/0x0c1bb53e0f3d1f3f8976f58de440dcd437c35bda02c61a238f179697356f6583';

    var date = new Date()	
    const doc = new jsPDF();
    //metadata
    // Optional - set properties on the document
    doc.setProperties({
        title: 'Mapsafe Transaction Record', subject: 'Mapsafe Transaction Record', author: 'Mapsafe',
        //keywords: 'generated, javascript, web 2.0, ajax',
        creator: 'Mapsafe'
    });

    //https://stackoverflow.com/questions/19065562/add-image-in-pdf-using-jspdf
    var img = new Image() //var imgData = 'data:image/jpeg;base64,'+ Base64.encode('Koala.jpeg');
    img.src = '../images/logo_name.png'
    doc.addImage(img, 'png', 25, 10, 50, 12.5) //x pos, y pos, height, width

    doc.text("Transaction Record!", 25, 40);     doc.setFontSize(10);
    //sent from browser metamask 
    doc.text("Date: " + date, 25, 50);                  doc.text(25, 57, 'Wallet Account Address: ');// + fromAddr);
    doc.setTextColor(0, 0, 255); /*blue color text*/    doc.text(70, 57, fromAddr); //fromAddr); //trying on the same line
    
    doc.setTextColor(0, 0, 0); //black color text
    doc.setFontSize(12);     doc.text("Details!", 25, 80);
    doc.setFontSize(10);     doc.text(25, 90,  'The following are the details of the generated encrypted file: ');
    
    doc.text(25, 97,  'Filename: ');
    doc.setTextColor(0, 0, 255); /*blue color text*/     doc.text(45, 97, hash_value);  
    doc.setTextColor(0, 0, 0);   /*black color text */   doc.text(25, 104, 'Hash Value: ');
    doc.setTextColor(0, 0, 255); /*blue color text */    doc.text(45, 104, hash_value);
    doc.setTextColor(0, 0, 0);   /*black color text */

    doc.text(25, 114, 'This hash value will be minted on Ethereum Blockchain with the following details: '); // + tx_hash); //txnNumber);
    doc.text(25, 121, 'Transaction Hash: ' + tx_hash); //txnNumber);
    doc.text(25, 128, 'Minting Address');
    //'The hash will be minted at the following address on the Ethereum Blockchain');
    //doc.setFontSize(10);
    doc.setTextColor(0, 0, 255); /*blue color text*/    doc.text(25, 135, tx_url);
    doc.setTextColor(0, 0, 0);   /*black color text */  doc.text(25, 142, 'Gas Price ' + gas_price);

    // generate pdf 
    var onlyDate = date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();   
    doc.save("MapsafeReceipt_"+ onlyDate +".pdf");
}

//This function is currently used. It saves one file only - ciphertext
function savezipfile(data,filename) {
    var zip = new JSZip();
    zip.file(filename+".zip", data); //encoded, "Hello World\n"
    console.log("Console: Save zip file " + filename);
    zip.generateAsync({type: "blob"})
        .then(function (content) {
            // see FileSaver.js
            saveAs(content, filename + ".zip");
        });
}

function savezipfilecontent(data,filename) {
    var blob = new Blob(data, {type: "application/zip"}); 
    saveAs(blob, filename + ".zip");
}

function convertStringToArrayBuffer(str) {
    var encoder = new TextEncoder("utf-8");
    return encoder.encode(str);
}
function convertArrayBuffertoString(buffer) {
    var decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer);
}

const circularReplacer = () => {
    // Creating new WeakSet to keep
    // track of previously seen objects
    const seen = new WeakSet();

    return (key, value) => {
        // If type of value is an
        // object or value is null
        if (typeof(value) === "object"
            && value !== null) {

            // If it has been seen before
            if (seen.has(value)) {
                return;
            }
            // Add current value to the set
            seen.add(value);
        }
        // return the value
        return value;
    };
};