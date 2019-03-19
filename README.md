# pdf-processor
An AWS Lamda function with the following capabilities.

1. Read a pdf file from a given url
2. Extract all images in all the pages of the pdf document.
3. Filter automobiles images from all extracted images using amazon Reknognition API
4. Save all filtered images on amazon s3
5. Return as response, public urls for each of the saved image in 4 above.

:)
