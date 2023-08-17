const { BatchDeleteImageCommand, DescribeImagesCommand, ECRClient } = require("@aws-sdk/client-ecr");
const moment = require("moment");
const { mockClient } = require("aws-sdk-client-mock");
const { cleanupImages } = require("./handler");
const { expect } = require("expect");
(globalThis).expect = expect;
require('aws-sdk-client-mock-jest')

const deletePromise = {
  imageIds: [
    {
      imageDigest: "3797470f-bb69-11e6-90e4-19b39eb619f7",
      imageTag: "some-tag",
    },
  ],
  failures: [],
}

const desribeImagesPromise = {
  nextToken: null,
  imageDetails: [
    {
      registryId: "384553929753",
      repositoryName: "test-repo",
      imageDigest: "1",
      imageTags: ["1.0.0-master", "ignore-this"],
      imageSizeInBytes: "1024",
      imagePushedAt: moment(),
    },
    {
      registryId: "384553929753",
      repositoryName: "test-repo",
      imageDigest: "2",
      imageTags: ["1.0.0-master", "ignore-this"],
      imageSizeInBytes: "1024",
      imagePushedAt: moment().add(-31, "days"),
    },
    {
      registryId: "384553929753",
      repositoryName: "test-repo",
      imageDigest: "3",
      imageTags: ["1.0.0-other", "ignore-this"],
      imageSizeInBytes: "1024",
      imagePushedAt: moment(),
    },
    {
      registryId: "384553929753",
      repositoryName: "test-repo",
      imageDigest: "4",
      imageTags: ["1.0.0-other", "dont-ignore-this"],
      imageSizeInBytes: "1024",
      imagePushedAt: moment().add(-31, "days"),
    },
    {
      registryId: "384553929753",
      repositoryName: "test-repo",
      imageDigest: "5",
      imageTags: ["1.0.0-main", "ignore-this"],
      imageSizeInBytes: "1024",
      imagePushedAt: moment().add(-31, "days"),
    },
  ],
}

const ecrMock = mockClient(ECRClient);

function callback() {}

describe("cleanupImages", () => {

  beforeEach(() => {
    ecrMock.reset()
    process.env.DRY_RUN = "true";
    process.env.REPO_NAMES = "test-repo";
    process.env.AWS_ACCOUNT_ID = "1234567890";
    ecrMock
      .on(DescribeImagesCommand).resolves(desribeImagesPromise)
      .on(BatchDeleteImageCommand).resolves(deletePromise)
  });

  it("Should not remove master images", async () => {
    process.env.DRY_RUN = "false";
    
    await cleanupImages(null, null, callback);

    expect(ecrMock).toHaveReceivedCommand(DescribeImagesCommand)
    expect(ecrMock).toHaveReceivedCommandWith(BatchDeleteImageCommand,{
      registryId: "1234567890",
      repositoryName: "test-repo",
      imageIds: [{ imageDigest: "4" }],
    })
  });

  it("Should not call delete if dry run", async () => {
    await cleanupImages(null, null, callback);

    expect(ecrMock).toHaveReceivedCommandWith(DescribeImagesCommand, {
      "maxResults": 100, 
      "registryId": "1234567890", 
      "repositoryName": "test-repo"
    })
    expect(ecrMock).toHaveReceivedCommandTimes(BatchDeleteImageCommand, 0)
    
  });
});
