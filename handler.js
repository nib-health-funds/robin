"use strict";
const {
  ECRClient,
  DescribeImagesCommand,
  BatchDeleteImageCommand,
} = require("@aws-sdk/client-ecr");
const moment = require("moment");
const filter = require("lodash.filter");
const rp = require("request-promise");

function postToSlack(text) {
  if (typeof process.env.SLACK_WEBHOOK === "undefined") {
    return Promise.resolve(text);
  }

  const options = {
    method: "POST",
    uri: process.env.SLACK_WEBHOOK,
    body: { text },
    json: true,
  };
  return rp(options);
}

async function getAllImages(ecr, registryId, repoName) {
  const params = {
    registryId: registryId,
    repositoryName: repoName,
    maxResults: 100,
  };

  const data = await ecr.send(new DescribeImagesCommand(params));
  return data.imageDetails;
}

function buildReport(
  isDryRun,
  reposNotFound,
  reposWithUntaggedImages,
  reposWithDeletedImagesDryRun,
  reposWithDeletedImages,
  reposWithImagesThatFailedToDelete,
) {
  const untaggedRepoKeys = Object.keys(reposWithUntaggedImages);
  const deletedDryRunRepoKeys = Object.keys(reposWithDeletedImagesDryRun);
  const deletedRepoKeys = Object.keys(reposWithDeletedImages);
  const failedToDeletedRepoKeys = Object.keys(
    reposWithImagesThatFailedToDelete,
  );

  if (
    reposNotFound.length === 0 &&
    untaggedRepoKeys.length === 0 &&
    deletedDryRunRepoKeys === 0 &&
    deletedRepoKeys.length === 0 &&
    failedToDeletedRepoKeys === 0
  ) {
    return "Robin ran but there no vigilamnte justice was needed";
  }

  const backticks = (str) => `\`${str}\``;
  const dryRunText = isDryRun ? " [DRY RUN]" : "";

  let text = "Robin has attempted to clean up the streets!";

  if (reposNotFound.length !== 0) {
    text += "\n\n\n===================================================";
    text += `\nRepositories not found (${reposNotFound.length})${dryRunText}`;
    text += "\n===================================================";
    reposNotFound.forEach((repoName) => {
      text += `\n${backticks(repoName)}`;
    });
  }

  if (untaggedRepoKeys.length !== 0) {
    text += "\n\n\n===================================================";
    text += `\nRepositories with untagged images (${untaggedRepoKeys.length})${dryRunText}`;
    text += "\n===================================================";
    untaggedRepoKeys.forEach((repoName) => {
      text += `\n${backticks(repoName)} - ${
        reposWithUntaggedImages[repoName]
      } image${reposWithUntaggedImages[repoName] > 1 ? "s" : ""}`;
    });
  }

  if (isDryRun) {
    text += "\n\n\n===================================================";
    text += `\nRepositories with images deleted (${deletedDryRunRepoKeys.length})${dryRunText}`;
    text += "\n===================================================";
    if (deletedDryRunRepoKeys.length === 0) {
      text += "\nNo images deleted";
    } else {
      deletedDryRunRepoKeys.forEach((repoName) => {
        // eslint-disable-next-line max-len
        text += `\n${backticks(repoName)} (${
          reposWithDeletedImagesDryRun[repoName].length
        } tags): ${reposWithDeletedImagesDryRun[repoName].join(", ")}`;
      });
    }
  } else {
    text += "\n\n\n===================================================";
    text += `\nRepositories with images deleted (${deletedRepoKeys.length})`;
    text += "\n===================================================";
    if (deletedRepoKeys.length === 0) {
      text += "\nNo images deleted";
    } else {
      deletedRepoKeys.forEach((repoName) => {
        text += `\n${backticks(repoName)} (${
          reposWithDeletedImages[repoName].length
        } tags): ${reposWithDeletedImages[repoName].join(", ")}`;
      });
    }

    if (failedToDeletedRepoKeys.length !== 0) {
      text += "\n\n\n===================================================";
      text += `\nRepositories with images that failed deleted (${failedToDeletedRepoKeys.length})`;
      text += "\n===================================================";
      deletedRepoKeys.forEach((repoName) => {
        // eslint-disable-next-line max-len
        text += `\n${backticks(repoName)} (${
          reposWithImagesThatFailedToDelete[repoName].length
        } tags): ${reposWithImagesThatFailedToDelete[repoName].join(", ")}`;
      });
    }
  }

  return text;
}

module.exports.cleanupImages = (event, context, callback) => {
  if (typeof process.env.REPO_NAMES === "undefined") {
    throw new Error(
      "Can't start lambda: missing REPO_NAMES environment variable",
    );
  }

  if (typeof process.env.AWS_ACCOUNT_ID === "undefined") {
    throw new Error(
      "Can't start lambda: missing AWS_ACCOUNT_ID environment variable",
    );
  }

  const repoNames = process.env.REPO_NAMES.split(",");
  const registry = process.env.AWS_ACCOUNT_ID;

  const ecrRegion = process.env.ECR_REGION || "us-east-1";
  const ecr = new ECRClient({ region: ecrRegion });

  const reposNotFound = [];
  const reposWithUntaggedImages = {};
  const reposWithDeletedImages = {};
  const reposWithDeletedImagesDryRun = {};
  const reposWithImagesThatFailedToDelete = {};

  console.log("Robin is dealing out some of his own justice...");
  console.log("Robin is using ECR Region: ", ecrRegion);

  const isDryRun = process.env.DRY_RUN === "true";
  console.log("Robin is running in dry run mode: ", isDryRun);

  const cutOffDate = moment().add(-30, "d");
  console.log("Using cut off date: ", cutOffDate);

  const promises = repoNames.map((repoName) =>
    getAllImages(ecr, registry, repoName)
      .then((images) => {
        // eslint-disable-line arrow-body-style
        return filter(images, (image) => {
          const isUntagged = typeof image.imageTags === "undefined";
          if (isUntagged) {
            if (typeof reposWithUntaggedImages[repoName] !== "number") {
              reposWithUntaggedImages[repoName] = 1;
            } else {
              reposWithUntaggedImages[repoName]++;
            }

            return false;
          }

          // filters out images that are 30 days old and don't contain the master tag
          return (
            !isUntagged &&
            moment(image.imagePushedAt).isBefore(cutOffDate) &&
            !image.imageTags.find(
              (tag) => tag.indexOf("master") > -1 || tag.indexOf("main") > -1,
            )
          );
        });
      })
      .then(async (toDelete) => {
        if (!toDelete || toDelete.length === 0) {
          return Promise.resolve({ imageIds: "none", failures: "none" });
        }

        console.log("Images to delete: ", toDelete);

        const convertedToDelete = toDelete.map((image) => {
          if (isDryRun) {
            image.imageTags.forEach((tag) => {
              if (
                typeof reposWithDeletedImagesDryRun[repoName] === "undefined"
              ) {
                reposWithDeletedImagesDryRun[repoName] = [];
              }
              reposWithDeletedImagesDryRun[repoName].push(tag);
            });
          }

          return { imageDigest: image.imageDigest };
        });

        if (isDryRun) {
          return Promise.resolve({ imageIds: [], failures: [] });
        }

        const deleteParams = {
          registryId: registry,
          repositoryName: repoName,
          imageIds: convertedToDelete,
        };

        return await ecr
          .send(new BatchDeleteImageCommand(deleteParams))
          .then((response) => {
            console.log("failures: ", response.failures);
            console.log("imageIds: ", response.imageIds);

            response.failures.forEach(({ imageId }) => {
              if (
                typeof reposWithImagesThatFailedToDelete[repoName] ===
                "undefined"
              ) {
                reposWithImagesThatFailedToDelete[repoName] = [];
              }
              reposWithImagesThatFailedToDelete[repoName].push(
                imageId.imageTag,
              );
            });

            response.imageIds.forEach(({ imageTag }) => {
              if (typeof reposWithDeletedImages[repoName] === "undefined") {
                reposWithDeletedImages[repoName] = [];
              }
              reposWithDeletedImages[repoName].push(imageTag);
            });
          });
      })
      .catch((err) => {
        if (
          err.code === "RepositoryNotFoundException" &&
          reposNotFound.indexOf(repoName) === -1
        ) {
          reposNotFound.push(repoName);
        }

        console.log(err);
      }),
  );

  return Promise.all(promises)
    .then(() => {
      const reportText = buildReport(
        isDryRun,
        reposNotFound,
        reposWithUntaggedImages,
        reposWithDeletedImagesDryRun,
        reposWithDeletedImages,
        reposWithImagesThatFailedToDelete,
      );

      // Log Results
      console.log(reportText.replace(/`/g, "")); // strip backticks when logging to CloudWatch (backticks are for Slack!)

      return Promise.resolve(reportText);
    })
    .then(
      (text) => postToSlack(text), // Post results to Slack
    )
    .then(() => {
      callback(null, { message: "robin executed successfully!", event });
    })
    .catch((err) => {
      console.log(err); // an error occurred
      callback(err);
      return;
    });
};
