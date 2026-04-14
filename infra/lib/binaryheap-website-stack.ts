import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import { Construct } from "constructs";

export class BinaryheapWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Route 53 Hosted Zone ---
    const hostedZone = route53.HostedZone.fromLookup(
      this,
      "HostedZone",
      { domainName: "binaryheap.com" },
    );

    // --- ACM Certificate ---
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "binaryheap.com",
      subjectAlternativeNames: ["*.binaryheap.com"],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // --- S3 Bucket (Site Hosting) ---
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: "binaryheap-com-website",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // --- Access Logs Bucket ---
    const accessLogsBucket = new s3.Bucket(this, "AccessLogsBucket", {
      bucketName: "binaryheap-com-access-logs",
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      }),
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- WAF WebACL ---
    const webAcl = new wafv2.CfnWebACL(this, "WebACL", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "BinaryheapWebACL",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CommonRuleSet",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedRulesAmazonIpReputationList",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "IpReputationList",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimitRule",
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimit",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // --- CloudFront Function (Viewer Request) ---
    const rewriteFunction = new cloudfront.Function(
      this,
      "ViewerRequestFunction",
      {
        code: cloudfront.FunctionCode.fromInline(`\
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Redirect old /blog/ URLs to /posts/
  if (uri.startsWith('/blog/')) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: '/posts/' + uri.slice(6) } }
    };
  }

  // Rewrite directory URLs to index.html
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}`),
      },
    );

    // --- CloudFront Distribution ---
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      domainNames: ["binaryheap.com", "www.binaryheap.com"],
      certificate,
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: accessLogsBucket,
      logFilePrefix: "cf-logs/",
      webAclId: webAcl.attrArn,
    });

    // --- Route 53 Records ---
    new route53.ARecord(this, "ApexRecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });

    new route53.ARecord(this, "WwwRecord", {
      zone: hostedZone,
      recordName: "www",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });

    // --- CodeStar Connection (GitHub) ---
    const connection = new codestarconnections.CfnConnection(
      this,
      "GitHubConnection",
      {
        connectionName: "binaryheap-github",
        providerType: "GitHub",
      },
    );

    // --- CodeBuild Project ---
    const buildProject = new codebuild.PipelineProject(this, "BuildProject", {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            "runtime-versions": { nodejs: 20 },
            commands: ["corepack enable", "pnpm install"],
          },
          build: {
            commands: ["pnpm run build"],
          },
          post_build: {
            commands: [
              `aws s3 sync dist/ s3://${siteBucket.bucketName} --delete`,
              `aws cloudfront create-invalidation --distribution-id ${distribution.distributionId} --paths "/*"`,
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
    });

    // Grant CodeBuild permissions to S3 and CloudFront
    siteBucket.grantReadWrite(buildProject);
    siteBucket.grantDelete(buildProject);

    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      }),
    );

    // --- CodePipeline ---
    const sourceOutput = new codepipeline.Artifact("SourceOutput");

    new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: "binaryheap-website",
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: "GitHub",
              owner: "benbpyle",
              repo: "binaryheap.com",
              branch: "main",
              connectionArn: connection.attrConnectionArn,
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: "BuildAndDeploy",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "BuildAndDeploy",
              project: buildProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "SiteBucketName", {
      value: siteBucket.bucketName,
      description: "S3 bucket for website hosting",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
      description: "CloudFront Distribution Domain Name",
    });

    new cdk.CfnOutput(this, "ConnectionArn", {
      value: connection.attrConnectionArn,
      description: "Authorize this CodeStar Connection in the AWS Console",
    });

    new cdk.CfnOutput(this, "WebsiteUrl", {
      value: "https://binaryheap.com",
      description: "Website URL",
    });
  }
}
