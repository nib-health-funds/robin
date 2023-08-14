const { BatchDeleteImageCommand, DescribeImagesCommand, ECRClient } = require("@aws-sdk/client-ecr");
const assert = require("assert");
const moment = require("moment");
const proxyquire = require("proxyquire");
const sinon = require("sinon");

const deletePromise = {
  promise: () =>
    Promise.resolve({
      imageIds: [
        {
          imageDigest: "3797470f-bb69-11e6-90e4-19b39eb619f7",
          imageTag: "some-tag",
        },
      ],
      failures: [],
    }),
};

const desribeImagesPromise = {
  promise: () =>
    Promise.resolve({
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
    }),
};

const sandbox = sinon.createSandbox();
const deleteStub = sandbox.stub().returns(deletePromise);
const describeImagesStub = sandbox.stub().returns(desribeImagesPromise);
const mocks = {
  "@aws-sdk/client-ecr": {
    ECRClient: function () {
      // eslint-disable-line
      this.send = (cmd) => {
        if (cmd instanceof BatchDeleteImageCommand) {
          cmd = deleteStub
        } else if (cmd instanceof DescribeImagesCommand) {
          cmd = describeImagesStub
        }
      }
    },
  },
};

describe("cleanupImages", () => {
  const cleanup = proxyquire("./handler.js", mocks);

  beforeEach(() => {
    process.env.DRY_RUN = "true";
    process.env.REPO_NAMES = "test-repo";
    process.env.AWS_ACCOUNT_ID = "1234567890";

    sandbox.reset();
  });

  it.only("Should not remove master images", (done) => {
    process.env.DRY_RUN = "false";
    deleteStub.returns(deletePromise);
    cleanup.cleanupImages(null, null, () => {
      assert(describeImagesStub.called);
      assert(
        deleteStub.calledWith({
          registryId: "1234567890",
          repositoryName: "test-repo",
          imageIds: [{ imageDigest: "4" }],
        }),
      );
      done();
    });
  });

  it("Should not call delete if dry run", (done) => {
    deleteStub.returns(deletePromise);
    cleanup.cleanupImages(null, null, () => {
      assert(describeImagesStub.called);
      assert(deleteStub.notCalled);
      done();
    });
  });
});
