# Robin

Batman's very capable side kick - deletes old ECR images keeping the red queen platform law abiding.
<center><img src="images/robin.jpg"</img></center>

# Why Robin?

Images stored in ECR incur monthly data storage charges, this means paying to store old images that are no longer in use. Also, AWS ECR has a default limit of 1000 images. Therefore, it is desirable to ensure the ECR repositories are kept clean of unused images.

# What we delete currently:

- Images older than 30 days that do not have tags that contain 'master'

# Usage

1. Authenticate and get AWS credentials via your preferred CLI, you may need to export the environment variables directly

1. Update the environment variables in serverless.yml to match your setup

1. Update the `repoNames` array in `handler.js` to reflect the repositories you want to clean

1. Lint the function

```
$ npm run lint
```

1. Test the function

```
$ npm test
```

3. Deploy the function

```
$ npm run deploy
```

4. Tail cloudwatch logs

```
$ npm run tail-logs
```


# TODO

- Only keep the last 10 master images (justification: we should be using the last images only, last 10 gives us something to rollback to if needed.)
- Add some more documentation to this readme
- Delete all untagged images
- Make repo names configurable via env vars