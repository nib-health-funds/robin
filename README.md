# Robin

Note that [ECR Lifecycle Policies](http://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html) may be a better fit for you use case.

[![Build Status](https://travis-ci.org/nib-health-funds/robin.svg?branch=master)](https://travis-ci.org/nib-health-funds/robin)
[![Dependencies](https://david-dm.org/nib-health-funds/robin.svg)](https://david-dm.org/nib-health-funds/robin)

Batman's very capable side kick - deletes old ECR images.
<center><img src="images/robin.jpg"></center>

## Why Robin?

Images stored in ECR incur monthly data storage charges, this means paying to store old images that are no longer in use. Also, AWS ECR has a default limit of 1000 images. Therefore, it is desirable to ensure the ECR repositories are kept clean of unused images.

## What we delete currently:

Per Lambda invocation:

- 100 images that are older than 30 days and that do not have tags that contain 'master'

If you need to delete more than 100 images, rather than complicating this script so that it can paginate
through all pages of images, we suggest you simply run the lambda multiple times.

## Usage

1. Authenticate and get AWS credentials via your preferred CLI, you may need to export the environment variables directly

1. Update the environment variables in serverless.yml to match your setup

1. Update the `repoNames` array in `handler.js` to reflect the repositories you want to clean

1. Lint the function

```
$ npm run lint
```

5. Test the function

```
$ npm test
```

6. Deploy the function

```
# Describe REPO_NAMES at deploy time

$ REPO_NAMES="test_repo,test_repo_1,test_repo_2" AWS_ACCOUNT_ID=1234567890 npm run deploy
```

7. Tail cloudwatch logs

```
$ npm run tail-logs
```


## TODO

- Only keep the last 10 master images (justification: we should be using the last images only, last 10 gives us something to rollback to if needed.)
- Add some more documentation to this readme
- Delete all untagged images
- Make tagging convention configurable
