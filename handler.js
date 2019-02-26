'use strict';

module.exports.hello = async (event, context) => {
    let requestBody = JSON.parse(event.body);

    require('./domstubs.js').setStubs(global);
    const AWS = require('aws-sdk');
    const pdfjsLib = require('pdfjs-dist');
    const https = require("https");
    const uuid = require('uuid/v1');
    let imageUrls = [];
    let extractedImages = [];

    //initialize amazon with required credentials
    let s3 = new AWS.S3({
        accessKeyId: 'AKIAIAGETVESWNQMI32A',
        secretAccessKey: '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'
    });

    //fetch pdf data from supplied URL
    https.get(requestBody.pdfUrl, (response) => {

        let data = [];

        response.on('data', (chunk) => {
            data.push(chunk);
        });

        response.on('end', () => {
            data = Buffer.concat(data); // do something with data

            const  automobileLabels = ['Machine','Engine', 'Motor', 'Vehicle','Transportation','Automobile'];
            data = new Uint8Array(data);
            let imageCount = 0;

            // function processImage(imageData,imageCount) {
            function processImage() {


                console.log("processing image");
                let jpg = true;
                let base64Image = imageData.split("data:image/jpeg;base64,")[1];
                let image = null;
                try {
                    image = atob(base64Image);
                }catch (e) {
                    jpg = false;
                }
                if (jpg === false) {
                    try {
                        image = atob(base64Image);
                    } catch (e) {
                        console.log(e);
                        console.log("Not an image file Rekognition can process");
                        return;
                    }
                }
                var length = image.length;
                let imageBytes = new ArrayBuffer(length);
                let ua = new Uint8Array(imageBytes);
                for (let i = 0; i < length; i++) {
                    ua[i] = image.charCodeAt(i);
                }

                checkImageLabel(imageBytes, (isAutomobile) => {
                    if(isAutomobile){
                        console.log(`Image  ${imageCount} is an automobile`);
                        uploadImagetoS3(base64Image,imageCount);
                    }else {
                        console.log(`Image  ${imageCount} is not an automobile`);
                    }

                });
            }

            function uploadImagetoS3(imageBytes,imageCount) {
                let buffer = Buffer.from(imageBytes,'base64');
                const bucketName = 'autopics';
                let uuid = uuid();

                console.log("uploading image " + imageCount + " to s3");
                var params = {
                    Bucket: bucketName, //this must have been created on amazon s3
                    Key: uuid,
                    Body: buffer,
                    ContentEncoding: 'base64',
                    ContentType: 'image/jpeg'

                };
                s3.putObject( params, ( error, data ) => {
                    if( error ){
                        console.log( "error uploading to s3" + error );
                    }else{
                        let imageUrl = `https://s3.amazonaws.com/${bucketName}/${uuid}`;
                        imageUrls.push({url: imageUrl});
                        console.log('image successfully uploaded' + JSON.stringify(data));
                    }
                });
            }

            //check whether image is an automobile
            function checkImageLabel(imageBytes,callback) {
                let rekognition = new AWS.Rekognition();
                let params = {
                    Image: {
                        Bytes: imageBytes
                    }
                };
                 rekognition.detectLabels(params, (err, data) => {
                    if (err) {
                        console.log(`error detecting labels for an image: ${err}`);
                        callback(false);
                    }
                    else {
                        console.log(JSON.stringify(data));
                        let isValidAutoLabel = false;
                        let imageLabels = data.Labels;
                        //did not use a forEach
                        for(let imageLabel of imageLabels){
                            if(automobileLabels.includes(imageLabel.Name)){
                                isValidAutoLabel = true;
                                break;
                            }
                        }
                        callback(isValidAutoLabel);
                    }
                });
            }

            let loadingTask = pdfjsLib.getDocument({
                data: data,
                nativeImageDecoderSupport: pdfjsLib.NativeImageDecoding.DISPLAY,
            });

            loadingTask.promise.then(function(doc) {
                let numPages = doc.numPages;
                console.log('# Document Loaded');
                console.log(`Number of Pages:  ${numPages}`);

                let lastPromise = Promise.resolve(); // will be used to chain promises
                let loadPage = function (pageNum) {
                    return doc.getPage(pageNum).then(page => {
                        console.log(`# Page ${pageNum}`);

                        return page.getOperatorList().then(opList => {
                            var svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
                            svgGfx.embedFonts = true;
                            for (let i=0; i < opList.fnArray.length; i++) {
                                if (opList.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {
                                    let imageInfo = page.objs.get(opList.argsArray[i][0]);
                                    extractedImages.push(imageInfo._src);
                                }
                            }
                        });
                    });
                };

                for (let i = 1; i <= numPages; i++) {
                    lastPromise = lastPromise.then(loadPage.bind(null, i));
                }
                return lastPromise;
            }).then( () => {
                    processImage();
                    console.log('# End of Document')
                }
                , () => console.error('Error: ' + err));

        });
    });

};
