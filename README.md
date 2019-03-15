# pdf-processor
A script to retrieve image of automobiles from a pdf spanning pages.

The action items of this script can be summarized as follows.

1. Read a pdf file from a given url
2. Extract all images in all the pages of the pdf document.
3. Filter automobiles images from all extracted images using amazon Reknognition API
4. Save all filtered images on amazon s3
5. Return as response, public urls for each of the saved image in 4 above.

:)
