'use strict';

module.exports.getAutomobiles = (event, context, callback) => {

    let requestBody = JSON.parse(event.body);

    require('./domstubs.js').setStubs(global);
    const AWS = require('aws-sdk');
    const pdfjsLib = require('pdfjs-dist');
    const https = require('https');
    const uuid = require('uuid/v1');
    let imageUrls = [];
    let extractedImages = [];
    let automobiles = [];

    //initialize amazon with required credentials
    let s3 = new AWS.S3({
        accessKeyId: 'AKIAI4WIPC4WSJUCR6RA',
        secretAccessKey: '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'
    });

    //fetch pdf data from supplied URL
    return https.get(requestBody.pdfUrl, (response) => {

        let data = [];

        response.on('data', (chunk) => {
            data.push(chunk);
        });

        response.on('end', () => {
            // data = Buffer.concat(data); // do something with data

            const automobileLabels = ['Machine', 'Engine', 'Motor', 'Vehicle', 'Transportation', 'Automobile'];
            let rawImageFile = new Uint8Array(Buffer.concat(data));

            function processImage() {

                let lastPromise = Promise.resolve();
                for (let i = 0; i < extractedImages.length; i++) {
                    let base64Image = extractedImages[i];
                    let imageBytes = getImageBytes(base64Image);
                    lastPromise = lastPromise.then(checkImageLabel.bind(null, imageBytes, i));
                }

                lastPromise.then(() => {
                    //upload images to s3.
                    let lastPromise = Promise.resolve();
                    automobiles.forEach((automobileImage) => {
                        lastPromise = lastPromise.then(uploadToS3.bind(null, getImageBytes(automobileImage)));
                    });

                    lastPromise.then(() => {
                        sendResponse();
                    })
                });
            }

            function uploadToS3(imageBytes) {
                let u = uuid();
                return new Promise((resolve, reject) => {
                    let buffer = Buffer.from(imageBytes, 'base64');
                    const bucketName = 'autopics';

                    let params = {
                        Bucket: bucketName, //this must have been created on amazon s3
                        Key: u,
                        Body: buffer,
                        ContentEncoding: 'base64',
                        ContentType: 'image/jpeg'

                    };
                    s3.putObject(params, (error, data) => {
                        if (error) {
                            console.log(`error uploading to s3  ${error}`);
                            reject(error);
                        } else {
                            let imageUrl = `https://s3.amazonaws.com/${bucketName}/${u}`;
                            imageUrls.push({url: imageUrl});
                            console.log('image successfully uploaded' + JSON.stringify(data));
                            resolve('image upload success');
                        }
                    });

                });
            }

            function getImageBytes(base64Image) {
                let image = null;
                let jpg = true;
                try {
                    image = atob(base64Image);
                } catch (e) {
                    jpg = false;
                }
                if (jpg === false) {
                    try {
                        image = atob(base64Image);
                    } catch (e) {
                        console.log(`Not an image file Rekognition can process ${e}`);
                        return;
                    }
                }
                let length = image.length;
                let imageBytes = new ArrayBuffer(length);
                let ua = new Uint8Array(imageBytes);
                for (let i = 0; i < length; i++) {
                    ua[i] = image.charCodeAt(i);
                }
                return imageBytes;
            }


            //check whether image is an automobile
            function checkImageLabel(imageBytes, imageIndex) {
                let rekognition = new AWS.Rekognition();
                let params = {
                    Image: {
                        Bytes: imageBytes
                    }
                };

                return new Promise((resolve, reject) => {
                    rekognition.detectLabels(params, (err, data) => {
                        if (err) {
                            console.log(`error detecting labels for an image: ${err}`);
                            reject(err);
                        } else {
                            console.log(JSON.stringify(data));
                            let isValidAutoLabel = false;
                            let imageLabels = data.Labels;

                            for (let imageLabel of imageLabels) {
                                if (automobileLabels.includes(imageLabel.Name)) {
                                    isValidAutoLabel = true;
                                    break;
                                }
                            }
                            if (isValidAutoLabel) {
                                automobiles.push(extractedImages[imageIndex]);
                            }
                            resolve(data);
                        }
                    });
                });
            }

            let loadingTask = pdfjsLib.getDocument({
                data: rawImageFile,
                nativeImageDecoderSupport: pdfjsLib.NativeImageDecoding.DISPLAY,
            });

            loadingTask.promise.then(function (doc) {
                let numPages = doc.numPages;
                console.log('# Document Loaded');
                console.log(`Number of Pages:  ${numPages}`);

                let lastPromise = Promise.resolve();
                let loadPage = function (pageNum) {
                    return doc.getPage(pageNum).then(page => {
                        console.log(`# Page ${pageNum}`);

                        return page.getOperatorList().then(opList => {
                            let svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
                            svgGfx.embedFonts = true;
                            for (let i = 0; i < opList.fnArray.length; i++) {
                                if (opList.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {
                                    let imageInfo = page.objs.get(opList.argsArray[i][0]);
                                    extractedImages.push(imageInfo._src.split('data:image/jpeg;base64,')[1]);
                                }
                            }
                        });
                    });
                };

                for (let i = 1; i <= numPages; i++) {
                    lastPromise = lastPromise.then(loadPage.bind(null, i));
                }
                return lastPromise;
            }).then(() => {
                    console.log('# End of Document')
                    return processImage();
                }
                , (err) => console.error(`Error: ${err}`));

        });
    });

    function sendResponse() {
        callback(null, {
            statusCode: 200,
            body: JSON.stringify({
                pdfUrls: imageUrls
            }),
        });
    }
};
