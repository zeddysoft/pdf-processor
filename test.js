const im = require('imagemagick');
const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
    const operation = event.queryStringParameters ? event.queryStringParameters.operation : null;
    let data = JSON.parse(event.body);
    switch (operation) {
        case 'ping':
            return sendRes(200, 'pong');
        case 'convert':
            return await operate(data);
        default:
            return sendRes(401, `Unrecognized operation "${operation}"`);
    }
};

const sendRes = (status, body) => {
    var response = {
        statusCode: status,
        headers: {
            "Content-Type": "text/html"
        },
        body: body
    };
    return response;
}

const operate = async (body) => {
    const customArgs = body.customArgs.split(',') || [];
    let outputExtension = 'png';
    let inputFile = null, outputFile = null;

    try {
        if (body.base64Image) {
            inputFile = '/tmp/inputFile.png';
            const buffer = new Buffer(body.base64Image, 'base64');
            fs.writeFileSync(inputFile, buffer);
            customArgs.unshift(inputFile); // customArgs should be like [inputFile, options, outputfile]
        }

        outputFile = `/tmp/outputFile.${outputExtension}`;
        customArgs.push(outputFile);

        await performConvert(customArgs);
        let fileBuffer = new Buffer(fs.readFileSync(outputFile));
        fs.unlinkSync(outputFile);

        await putfile(fileBuffer); // upload file to s3
        return sendRes(200, '<img src="data:image/png;base64,' + fileBuffer.toString('base64') + '"//>');
    } catch (e) {
        console.log(`Error:${e}`);
        return sendRes(500, e);
    }
}

const performConvert = (params) => {
    return new Promise(function (res, rej) {
        im.convert(params, (err) => {
            if (err) {
                console.log(`Error${err}`);
                rej(err);
            } else {
                res('operation completed successfully');
            }
        });
    });
}

const putfile = async (buffer) => {
    let params = {
        Bucket: 'foobucketlambda',
        Key: 'images/' + Date.now().toString() + '.png',
        Body: buffer
    };
    return await s3.putObject(params).promise();
}