
/* Four arguments: the div ID from the input, the div ID of the output (where geoJSON will be injected into), the name for the output variable, and the name of the variable that will store the projection of the original data */

// Create empty projection variable to fill later
var projection = [];

//29 July 2021 ..hve these as global variables
// Create local random distance and angle variables
var minimum_Distance, maximum_Distance, maximum_Distance_more;

var sensitive_Data_try; //store the transformed data in this variable
var sensitivePrime;

//log, lat centre of the map later for mapbox
var map_centre_lon, map_centre_lat;
//var map_centre_lon = -120.37, map_centre_lat = 50.690;

var original_shapefile; //for later encryting and saving as part of encrypted volume 

var calculate_sp_measure = false; //for calculating Spruill's Measure

// Note some large datasets, the belgium one, takes long because of H3 binning reading it in. Remember, that process is also reading the geojson in.
//Reads a zipped shapefile and injects it into the html as a geojson variable based on input layerName
loadShapeFile = function(sourceID, outputID, layerName) {
    var fileInput = document.getElementById(sourceID);
    var reader = new FileReader();
    reader.onload = function (event) {
            var blob = event.target.result;
            original_shapefile = blob;
            var projFileName;
            JSZip.loadAsync(blob).then(function(result){ 
                myKeys = Object.keys(result.files);
                myKeys.forEach(function(i){if (i.endsWith('prj') == true ) {projFileName = i;}})
            });
            JSZip.loadAsync(blob).then(function(result){ 
                projectionPromise = result.files[projFileName].async('text');
                projectionPromise.then(function(proj){projection[layerName] = proj; console.log(proj);}) //Add the projection text to the projection array and name it based on the input layer name
            });
        shp(event.target.result).then(function (geojson) {
            console.log("Loading GeoJSON from File")
            $("#" + outputID).html(layerName + ".data = " + JSON.stringify(geojson) + ";");
            //display geojson
            //console.log(layerName + " Loaded" + JSON.stringify(geojson)); 

            //14-DEC-2022    
            //console.log("Loading GeoJSON in Variable")
            //$("#" + outputID).html(layerName + ".data = " + JSON.stringify(testgeojson4) + ";");
            //console.log(layerName + " Loaded2" + JSON.stringify(testgeojson4));
            
            //11-Oct-2021..we just assign the medium and coarse layer to the same values
            //these would be changed with a cerain offset in the masking function
            /* not needed here
            $("#" + outputID).html(layerName + "Med.data = " + JSON.stringify(geojson) + ";");
            console.log(layerName + "Med Loaded");
            $("#" + outputID).html(layerName + "Coarse.data = " + JSON.stringify(geojson) + ";");
            console.log(layerName + "Coarse Loaded");
            */
        });
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
};

//Adds a geojson layer to the map, using the selected OpenLayers style
toMap = function(sourceGeoJSON, styleChoice) {
        map.removeLayer(sourceGeoJSON.layer);
        var source = new ol.source.Vector({
            features: (new ol.format.GeoJSON()).readFeatures(sourceGeoJSON, { featureProjection: 'EPSG:3857' })
        });
        sourceGeoJSON.layer = new ol.layer.Vector({
            zIndex: 9,
            renderMode: 'image',
            source: source,
            style: styleChoice
        });
        map.addLayer(sourceGeoJSON.layer);        
        var extent = sensitive.data.layer.getSource().getExtent();        
        console.log('extent:' + extent)
        console.log ('centre coordinates: ' + map.getView().getCenter())

        //var box = projection.transformExtent(extent,'EPSG:3857','EPSG:4326'); 
        //console.log("Latitude and longitude :",box); 
        
        //map.getView().getCenter() returns coordinates in ESPG:3857, not in lonlat.
        //Update for OpenLayers 6 (assuming your map is called 'map') the following gives an array of [lon, lat] for the centre of your map's view.
        //You have to convert coordinates or the polygon will be out of the world
            // var [lon, lat] = ol.proj.toLonLat( map.getView().getCenter() );   
            // map_centre_lon = lon; //set this in the H3binning.js
            // map_centre_lat = lat;
            // console.log ('centre: ' + ol.proj.toLonLat( map.getView().getCenter() )  );
            // console.log ('map_centre_lon: ' + map_centre_lon  );
            // console.log ('map_centre_lat: ' + map_centre_lat  )        
            //console.log ('More centre: ' + ol.proj.transform(map.getView().getCenter(), 'EPSG:3857', 'EPSG:4326')   );
     
        //get centre    
        var center = turf.center(sourceGeoJSON);
        console.log ('Turf centre: ' +   JSON.stringify(center) );
        map_centre_lon = turf.center(sourceGeoJSON).geometry.coordinates[0].toFixed(2)
        map_centre_lat = turf.center(sourceGeoJSON).geometry.coordinates[1].toFixed(2)
        console.log ('map_centre_lon: ' + map_centre_lon + ' map_centre_lat: ' + map_centre_lat  );

        map.getView().fit(extent, { size: map.getSize(), maxZoom: 13 });
}

//Create sensitive data layer and add styling
var sensitive = {
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#FF8078'
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: .5
            })
        })
    }),
};

//11-10-2021 ..medium level sensitive
//Create sensitive data layer and add styling
var sensitiveMed = {
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#FF8078'
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: .5
            })
        })
    }),
};

//Create boundary data layer and add styling, including variable for whether the boundary is loaded or not, and a function to give each row an ID 
var boundary = {
    isLoaded: false,
    assignID: function () {
        for (var i = 0; i < boundary.data.features.length; i++) {
            boundary.data.features[i].properties.newID = i;
        }
    },
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#00acce'
        })
    })
};

//Create masked data layer and add styling, as well as some empty array variables such that they are cleared every time the masking procedure is started
var masked = {
    rawdata: [],
    rawReprojected: [],
    reprojected: [],
    data: [],
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#5FAFFF'  //set to blue
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: .5
            })
        })
    }),
};

// 11-10-2021. Medium level masked 
// Create masked data layer and add styling, as well as some empty array variables such that they are cleared every time the masking procedure is started
var maskedMore = {
    rawdata: [],
    rawReprojected: [],
    reprojected: [],
    data: [],
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#097969' //set this to green '#5FAFFF' 
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: .5
            })
        })
    }),
};

//Create a layer for the points that are identified as being part of clusters from the sensitive layer, add styling, and variables to again be cleared when masking is started
var sensitiveClusters = {
    data: [],
    cluster: [],
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#FF241F'
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: 1.5
            })
        })
    }),
};

var sensitiveMedClusters = {
    data: [],
    cluster: [],
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#FF241F'
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: 1.5
            })
        })
    }),
};

//Create a layer for the points that are identified as being part of clusters from the masked, add styling, and variables to again be cleared when masking is started
var maskedClusters = {
    data: [],
    cluster: [],
    style: new ol.style.Style({
        image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({
                color: '#0593FF'
            }),
            stroke: new ol.style.Stroke({
                color: 'black',
                width: 1.5
            })
        })
    }),
};

//Create empty variable to hold stuff related to spruill's measure calculation
var spruill = [];

//Main masking procedure
var xyz = {
    //Define random number generator function
    getRandom: function (min, max) {
        const randomBuffer = new Uint32Array(1);
        window.crypto.getRandomValues(randomBuffer);
        let randomNumber = randomBuffer[0] / (0xffffffff + 1);
        randomResult = (randomNumber * (max - min)) + min;
        return randomResult;
    },
    getRandomCurved: function(min, max) {
        while (true) {
            randomAttempt = this.getRandom(min, max);
            probability = randomAttempt;
            randomQualifier = this.getRandom(min, max);
            if (randomQualifier < probability) {
                return randomAttempt;
            }
        }
    },
    //Displace function is the main donut masking procedure
    //masking twice takes the same time as masking once, i tried masking the belgium dataset in maskmy.xyz and it takes 29 sec
    displace: function () {
        //console.log('here 2 sensitive.data: ' + sensitive.data);
        //console.log('here 2 sensitiveMed.data: ' + sensitiveMed.data);

        var startTime = new Date();
        //22-dec-2022 count the number of points in a shapefile
        var numPoints = 0;  
        //If masking has already been performed, clear any generated variables
        if (masked.data.layer !== null) {
            map.removeLayer(masked.data.layer);
            map.removeLayer(maskedMore.data.layer);     //map.removeLayer(sensitive.data.layer);
            map.removeLayer(maskedClusters.cluster.layer);            
            map.removeLayer(sensitiveClusters.cluster.layer);
            masked.data = [];
            masked.rawdata = [];
            masked.rawReprojected = [];
            masked.reprojected = [];
            maskedClusters.data = [];
            sensitiveClusters.data = [];
            maskedClusters.cluster = [];
            sensitiveClusters.cluster = [];
            maskedClusters.cluster = [];
            sensitiveClusters.cluster = [];
            spruill.length = [];
            sensitive.length = [];
            numPoints = 0;  //22-dec-2022 set the number of points to zero 
        }
        //Test if boundary is loaded or not, and if it is then give each row an ID
        if (typeof boundary.data !== 'undefined') {
            boundary.isLoaded = true;
            boundary.assignID();
        }
        //Get the user-defined distance values and convert them to meters
        this.minDist = document.getElementById("minDistInput").value;        this.maxDist = document.getElementById("maxDistInput").value;
        this.minDist = this.minDist / 1000;                                  this.maxDist = this.maxDist / 1000;
        
        console.log('masking levels_to_safeguard ' + levels_to_safeguard)

        //11-Oct-2021. Second (more) level masking
        //For masking, the masking level (second level) is based on user input. 
        //Using a constant for the more masked parameter, i.e. 50 meters, the random number can fall anywhere within the above masking distance. 
        //this.minDistMore = this.minDist + 50;       this.maxDistMore = this.maxDist + 50; 
        //So we have the more masked layer (the outer level) the minimum starting from the maximum of the initial parameters and the maximum as the difference of the original maximum minus minimum. 
        this.minDistMore = this.maxDist;       
        if (levels_to_safeguard == 3 ) 
            this.maxDistMore = this.maxDist + (this.maxDist - this.minDist); 
        console.log('minDist: ' + this.minDist + ' maxDist: ' + this.maxDist + ' minDistMore: ' + this.minDistMore + ' maxDistMore: ' + this.maxDistMore);       
        console.log('sensitive.data: ' + sensitive.data);

        //22 Feb 2023. For the metadata files in the encrypted volume
        minimum_Distance = this.minDist * 1000;    maximum_Distance = this.maxDist * 1000;    
        if (levels_to_safeguard == 3 )  
            maximum_Distance_more = this.maxDistMore * 1000;       

        //Masking time!
        //Note a random distance is create for each cordinate
        turf.featureEach(sensitive.data, function (currentFeature, featureIndex) {
            // 29 July -- have these as global
            // //Create local random distance and angle variables
            var randDist, randDistMore;
            var randAngle,randAngleMore;
            var currentFeatureMaskedMore, currentFeatureReprojectedMore;

            var currentFeatureMore = currentFeature;
            do {
                var isWithinBoundary = false; //Set the boundary checker to false
                randDist = xyz.getRandomCurved((xyz.minDist), (xyz.maxDist)); //generate a random distance based on user inputs
                randAngle = xyz.getRandom(0.000000, 360.000000); 
                //console.log('randDist '+ randDist)
                //Important here is that the next random is generated with its minimum starting from the first maximum position
                if (levels_to_safeguard == 3 ) {
                    randDistMore = xyz.getRandomCurved((xyz.maxDist), (xyz.maxDistMore)); //generate a random distance between the maximum of the first //minDistMore
                    //console.log('randDistMore '+ randDistMore)  //console.log(randDist*1000)
                    randAngleMore = xyz.getRandom(0.000000, 360.000000); //generate a random angle again
                }
                //transform each feature
                var currentFeatureMasked = turf.transformTranslate(currentFeature, randDist, randAngle); //move the current point according to the random distance and angle that were generated
                var currentFeatureReprojected = jQuery.extend(true, {}, currentFeatureMasked); //add the now masked feature to the reprojected object (where it will get reprojected). Must do this first to add the whole object, rather than just the reprojected coordinates
                currentFeatureReprojected.geometry.coordinates = proj4(projection['sensitive'], currentFeatureMasked.geometry.coordinates); //reproject the coordinates based on the projection of the original sensitive input data
                
                if (levels_to_safeguard == 3 ){ 
                    currentFeatureMaskedMore = turf.transformTranslate(currentFeatureMore, randDistMore, randAngleMore); //move the current point according to the random distance and angle that were generated
                    currentFeatureReprojectedMore = jQuery.extend(true, {}, currentFeatureMaskedMore); //add the now masked feature to the reprojected object (where it will get reprojected). Must do this first to add the whole object, rather than just the reprojected coordinates
                    currentFeatureReprojectedMore.geometry.coordinates = proj4(projection['sensitive'], currentFeatureMaskedMore.geometry.coordinates);
                }

                // Boundary Checking
                if (boundary.isLoaded == true) {
                    var p1 = turf.tag(currentFeature, boundary.data, "newID", "bID"); //spatial join the sensitive point to the boundary its in
            //        var p1more = turf.tag(currentFeatureMore, boundary.data, "newID", "bID"); //spatial join the sensitive point to the boundary its in
                    var p2 = turf.tag(currentFeatureMasked, boundary.data, "newID", "bID"); //spatial join the masked point to the boundary its in
            //        var p2more = turf.tag(currentFeatureMaskedMore, boundary.data, "newID", "bID"); //spatial join the masked point to the boundary its in
                    turf.tag(currentFeatureReprojected, boundary.data, "newID", "bID"); //not entirely sure this line is even necessary or does anything
                    //Test whether the boundary ID that was assigned to the sensitive and masked location are the same, and if so then set the boundary checker variable to true, add the masked feature and its reprojected version to their respective arrays, otherwise, keep the boundary checker variable false
//$$ havent coded the second level for this
                    if (p1.properties.bID == p2.properties.bID) { 
                        isWithinBoundary = true;
                        masked.rawdata.push(currentFeatureMasked);    
                        masked.rawReprojected.push(currentFeatureReprojected);                       
                        if (levels_to_safeguard == 3 ) {
                            maskedMore.rawdata.push(currentFeatureMaskedMore);   
                            maskedMore.rawReprojected.push(currentFeatureReprojectedMore);
                        }
                    }
                    else {
                        isWithinBoundary = false;
                    };
                }
                else { //if no boundary layer is loaded, then just push the masked data into the appropriate arrays
                    masked.rawdata.push(currentFeatureMasked);    
                    masked.rawReprojected.push(currentFeatureReprojected);                         
                    if (levels_to_safeguard == 3 ) { 
                        maskedMore.rawdata.push(currentFeatureMaskedMore);                    
                        maskedMore.rawReprojected.push(currentFeatureReprojectedMore);
                    }
                };
                
                // Spruill's Measure Calculation
                //$$ havent coded this for the second level 
                if(calculate_sp_measure){
                    nearestPoint = turf.nearestPoint(currentFeatureMasked, sensitive.data)
                    actualDist = turf.nearestPoint(currentFeatureMasked, currentFeature)
                    if (nearestPoint.properties.distanceToPoint == actualDist.properties.distanceToPoint) {
                        spruill.push("yes");
                    }
                }
                
                numPoints++;
            } while (boundary.isLoaded == true && isWithinBoundary == false); //this keeps the procedure looping until the boundary variable is true. If no boundary is loaded, then it'll just run it once and be done.
        });

        masked.data = turf.featureCollection(masked.rawdata);     
        masked.reprojected = turf.featureCollection(masked.rawReprojected);          
        if (levels_to_safeguard == 3 ){  
            maskedMore.data = turf.featureCollection(maskedMore.rawdata); //turn the masked data array of features into a Feature Collection
            maskedMore.reprojected = turf.featureCollection(maskedMore.rawReprojected); //do the same as above for the reprojected version
        }
        if (calculate_sp_measure){
            //Do Spruill's Measure and turn on stats divs
            sensitive.length = Object.keys(sensitive.data.features).length; //find the number of points in the sensitive layer
            spruill.measure = (100 - ((spruill.length / sensitive.length)*100)); //calculate spruill's measure
            //Do HTML edits to insert spruill's measure, show the privacy rating element, show the center movement element, and edit the text in the masking button
            console.log("Privacy Rating: " + (Math.round(spruill.measure)) + "/100 (higher is better)");
            $message = $('.tabcontent3 span.pr');
            $message.text((Math.round(spruill.measure)) + '/100 (higher is better)!');
        }

        //sensitiveCoarse.data = sensitive.data;  //to start with the coarse data is assigned to be the same 
        //console.log('sensitiveCoarse.data: ' + sensitiveCoarse.data);
        //console.log('here 21 xyz.minDistCoarse: ' + xyz.minDistCoarse);             
        //$("#centerMoveDiv").show();
        // Process Center Calculations, Cluster Analysis, and Do Spruill's Measure code removed
        $("#mask").html("Mask Again!");
        
        endTime = new Date();
        executionTime = ((endTime - startTime) / 1000);
        console.log('Masking Complete. Number of points: ' + numPoints) 
        //turf count https://github.com/turf-junkyard/turf-count
        console.log('Time taken ' + executionTime);
    },
};