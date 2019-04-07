const { RPCClient } = require('@alicloud/pop-core');
const Koa = require('koa');
const path = require('path')
const router = require('koa-router')(); 
const static = require('koa-static');
const app = new Koa();

// AK信息，需填写子用户AK，子用户需要IMMFull和STSFull权限
var akInfo = {
  accessKeyId: "LT******et",
  accessKeySecret: "tX******vf"
};

// 角色信息，需填写
var roleArn = "acs:ram::******le";

// 转换结果存放路径
const previewTgtPath = 'demo-preview-tgt';

router.get('/api/get_config', async function (ctx, next) {
  // IMM Project和OSS所在region
  var region = ctx.query.region;
  // IMM Project
  var immProject = ctx.query.project;
  // 待转换文件路径
  var immSrcUri = ctx.query.file;

  var bucket = getBucketByUri(immSrcUri);
  
  var fileName = getFileNameByUri(immSrcUri);
  
  await createImmTask({
    endpoint: `https://imm.${region}.aliyuncs.com`,
    accessKeyId: akInfo.accessKeyId,
    accessKeySecret: akInfo.accessKeySecret,
    apiVersion: '2017-09-06'
  }, {
    Project: immProject,
    SrcUri: immSrcUri,
    TgtType: "vector",
    TgtUri: `oss://${bucket}/${previewTgtPath}/${fileName}`
  });
  
  var sts = await getSts(region, bucket, fileName);
  
  ctx.response.body = sts;
});

function createImmTask(immClientParam, immParams) {
  return new Promise((a) => {
    new RPCClient(immClientParam).request("createOfficeConversionTask", immParams).then(a); 
  });
}

function getSts(region, bucket, fileName) {
  return new Promise((a) => {
    new RPCClient({
      endpoint:'https://sts.aliyuncs.com',
      accessKeyId: akInfo.accessKeyId,
      accessKeySecret: akInfo.accessKeySecret,
      apiVersion: '2015-04-01'
    }).request('AssumeRole', {
      // AssumeRole action
      Action: 'AssumeRole',
      // 有权限访问OSS的角色
      RoleArn: roleArn,
      // 此参数用来区分不同的Token，以标明谁在使用此Token，便于审计。格式：^[a-zA-Z0-9.@-_]+$，2-32个字符
      RoleSessionName: "test",
      // 权限最小化，限制用户只能访问该文档
      Policy: JSON.stringify({
        "Version": "1",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "oss:GetObject"
            ],
            "Resource": [
              `acs:oss:*:*:${bucket}/${previewTgtPath}/${fileName}/*`
            ]
          }
        ]
      }),
      // 有效期
      DurationSeconds: 3600
    }).then(function(result) {
      var params = {};
      // 预览文档地址
      params.url = `https://${bucket}.oss-${region}.aliyuncs.com/${previewTgtPath}/${fileName}`;
      // 访问预览文档的accessKeyId
      params.accessKeyId = result.Credentials.AccessKeyId;
      // 访问预览文档的accessKeySecret
      params.accessKeySecret = result.Credentials.AccessKeySecret;
      // 访问预览文档的SecurityToken
      params.stsToken = result.Credentials.SecurityToken;
      // 预览文档的region
      params.region = `oss-${region}`;
      // 预览文档的bucket
      params.bucket = bucket;
  
      a(params);
    });
  });
}

// 配置静态web服务的中间件
app.use(static(
  path.join(__dirname, './public'))
);

app.use(router.routes());

app.listen(3000);


function getBucketByUri(uri) {
  if(uri.startsWith("oss://")){
    return uri.substr(6).split("/")[0];
  }
}

function getFileNameByUri(uri) {
  var arr = uri.split("/");
  return arr[arr.length - 1];
}