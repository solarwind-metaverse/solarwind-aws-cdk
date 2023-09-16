import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';

export class AdminBackendCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'SolarwindAdminBackendVpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'PublicSubnet',
        },
        // Add more subnet configurations as needed (e.g., private subnets)
      ]
    });

    const cluster = new ecs.Cluster(this, 'SolarwindAdminBackendCluster', {
      vpc,
    });

    const ecrAccessRole = new iam.Role(this, 'ECRAccessRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'SolarwindAdminBackendTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: ecrAccessRole
    });

    // Attach the AmazonEC2ContainerRegistryPowerUser managed policy to the role
    ecrAccessRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'));

    const securityGroup = new ec2.SecurityGroup(this, 'SolarwindAdminBackendSg', {
      vpc,
      allowAllOutbound: true, // Allow outbound traffic
    });
    
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');

    const container = taskDefinition.addContainer('SolarwindAdminBackendContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/z5f5d1o3/solarwind-admin-backend'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'SolarwindAdminBackendLogs' }),
      portMappings: [{
        containerPort: 80,
        hostPort: 80,
        protocol: ecs.Protocol.TCP
      }],
      environment: {
        ADMIN_BACKEND_PORT: '80'
      }
      // Add any necessary environment variables, ports, etc. here
    });

    const ecsFargateService = new ecs.FargateService(this, 'SolarwindAdminBackendService', {
      cluster,
      taskDefinition,
      assignPublicIp: true, // Assign public IPs to Fargate tasks
      securityGroups: [securityGroup],
    });

    
    const alb = new elbv2.ApplicationLoadBalancer(this, 'SolarwindAdminBackendLb', {
      vpc,
      internetFacing: true, // This makes the ALB internet-facing
    });
    
    const listener = alb.addListener('SolarwindAdminBackendListener', {
      port: 80,
      open: true,
    });
    
    listener.addTargets('SolarwindAdminBackendTarget', {
      port: 80,
      targets: [ecsFargateService],
      healthCheck: {
        path: '/api/status',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
    });
   
  }
}