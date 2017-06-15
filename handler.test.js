const assert = require('assert');
const moment = require('moment');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const deletePromise = {
  promise: () => Promise.resolve({
    imageIds: [{
      imageDigest: '3797470f-bb69-11e6-90e4-19b39eb619f7',
      imageTag: 'some-tag'
    }],
    failures: []
  })
};

const desribeImagesPromise = {
  promise: () => Promise.resolve(
    {
      nextToken: null,
      imageDetails: [{
        registryId: '384553929753',
        repositoryName: 'test-repo',
        imageDigest: '1',
        imageTags: ['1.0.0-master', 'ignore-this'],
        imageSizeInBytes: '1024',
        imagePushedAt: moment()
      },
      {
        registryId: '384553929753',
        repositoryName: 'test-repo',
        imageDigest: '2',
        imageTags: ['1.0.0-master', 'ignore-this'],
        imageSizeInBytes: '1024',
        imagePushedAt: moment().add(-31, 'days')
      },
      {
        registryId: '384553929753',
        repositoryName: 'test-repo',
        imageDigest: '3',
        imageTags: ['1.0.0-other', 'ignore-this'],
        imageSizeInBytes: '1024',
        imagePushedAt: moment()
      },
      {
        registryId: '384553929753',
        repositoryName: 'test-repo',
        imageDigest: '4',
        imageTags: ['1.0.0-other', 'dont-ignore-this'],
        imageSizeInBytes: '1024',
        imagePushedAt: moment().add(-31, 'days')
      }]
    })
};

const sandbox = sinon.sandbox.create();
const deleteStub = sandbox.stub();
const describeImagesStub = sandbox.stub().returns(desribeImagesPromise);
const rpStub = sandbox.stub();
const mocks = {
  'aws-sdk': {
    ECR: function () { // eslint-disable-line
      this.batchDeleteImage = deleteStub;
      this.describeImages = describeImagesStub;
    }
  },
  'request-promise': rpStub
};

describe('cleanupImages', () => {
  const cleanup = proxyquire('./handler.js', mocks);

  beforeEach(() => {
    sandbox.reset();
  });

  it('Should not remove master images', done => {
    deleteStub.returns(deletePromise);
    process.env.DRY_RUN = false;
    cleanup.cleanupImages(null, null, () => {
      assert(describeImagesStub.called);
      assert(deleteStub.calledWith({
        registryId: '441581275790',
        repositoryName: 'test-repo',
        imageIds: [{ imageDigest: '4' }]
      }));
      assert(rpStub.called);
      done();
    });
  });

  it('Should not call delete if dry run', done => {
    deleteStub.returns(deletePromise);
    process.env.DRY_RUN = true;
    cleanup.cleanupImages(null, null, () => {
      assert(describeImagesStub.called);
      assert(deleteStub.notCalled);
      assert(rpStub.called);
      done();
    });
  });

  it('Should handle pagination using the nextToken', done => {

    const stub = sandbox.stub();
    stub.onCall(0).returns({
      promise: () => Promise.resolve(
        {
          nextToken: 'next-please',
          imageDetails: [{
            registryId: '384553929753',
            repositoryName: 'test-repo-1',
            imageDigest: '4',
            imageTags: ['1.0.0-other', 'dont-ignore-this'],
            imageSizeInBytes: '1024',
            imagePushedAt: moment().add(-31, 'days')
          }]
        })
    });

    stub.onCall(1).returns({
      promise: () => Promise.resolve(
        {
          nextToken: null,
          imageDetails: [{
            registryId: '384553929754',
            repositoryName: 'test-repo-2',
            imageDigest: '4',
            imageTags: ['1.0.0-other', 'dont-ignore-this'],
            imageSizeInBytes: '1024',
            imagePushedAt: moment().add(-31, 'days')
          }]
        })
    });

    const cleanupImagesProxy = proxyquire('./handler.js', {
      'aws-sdk': {
        ECR: function () { // eslint-disable-line
          this.batchDeleteImage = deleteStub;
          this.describeImages = stub;
        }
      },
      'request-promise': rpStub
    });

    process.env.DRY_RUN = false;

    cleanupImagesProxy.cleanupImages(null, null, () => {
      const secondCall = stub.getCall(1);
      
      assert(secondCall.calledWithMatch({
        registryId: '441581275790',
        repositoryName: 'test-repo',
        maxResults: 100,
        nextToken: 'next-please'
      }), 'describeImages was not called with the next token for the 2nd time');
      assert(stub.callCount === 2, 'describeImages was not called 2 times');
      done();
    });
  });
});
