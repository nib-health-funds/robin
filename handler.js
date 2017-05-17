'use strict';

const AWS = require('aws-sdk');
const moment = require('moment');
const filter = require('lodash.filter');

const registry = '441581275790';
const repoNames = [
  'test-repo'
];

const rp = require('request-promise');

function postToSlack(deleted, failed) {
  const removedText = `${deleted === 'none' ? 0 : deleted.length} ECR images have been removed.`;
  const failedText = `${failed === 'none' ? 0 : failed.length} ECR images encounted problems when trying to remove them.`;
  const options = {
    method: 'POST',
    uri: process.env.SLACK_WEBHOOK,
    body: { text: `${removedText}\n${failedText}` },
    json: true
  };
  return rp(options);
}

module.exports.cleanupImages = (event, context, callback) => {
  console.log('Robin is dealing out some of his own justice...');
  
  const isDryRun = process.env.DRY_RUN === 'true';
  console.log('Robin is running in dry run mode: ', isDryRun);

  const ecrRegion = process.env.ECR_REGION || 'us-east-1';
  console.log('Robin is using ECR Region: ', ecrRegion);

  const ecr = new AWS.ECR({ apiVersion: '2015-09-21', region: ecrRegion });

  const cutOffDate = moment().add(-30, 'd');
  console.log('Using cut off date: ', cutOffDate);

  const promises = repoNames.map(repoName => {
    const params = {
      registryId: registry,
      repositoryName: repoName,
      maxResults: 100
    };

    return ecr.describeImages(params)
      .promise()
      .then(images => { // eslint-disable-line arrow-body-style
        return filter(images.imageDetails, image => (
          // filters out images that are 30 days old and don't contain the master tag
          moment(image.imagePushedAt).isBefore(cutOffDate)
          && !image.imageTags.find(tag => tag.indexOf('master') > -1)
        ));
      })
      .then(toDelete => {
        console.log('Images to delete: ', toDelete);
        if (!toDelete || toDelete.length === 0) return Promise.resolve({ imageIds: 'none', failures: 'none' });
        const convertedToDelete = toDelete.map(image => ({ imageDigest: image.imageDigest }));
        const deleteParams = {
          registryId: registry,
          repositoryName: repoName,
          imageIds: convertedToDelete
        };

        if (isDryRun) {
          return Promise.resolve({ imageIds: [], failures: []});
        }

        return ecr.batchDeleteImage(deleteParams).promise();
      })
      .then(deleteData => {
        console.log('Deleted images: ', deleteData.imageIds);
        console.log('Delete failures: ', deleteData.failures);
        return postToSlack(deleteData.imageIds, deleteData.failures);
      });
  });

  return Promise.all(promises)
    .then(() => {
      callback(null, { message: 'robin executed successfully!', event });
    })
    .catch(err => {
      console.log(err); // an error occurred
      callback(err);
      return;
    });
};
