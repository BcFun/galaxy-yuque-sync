# yuque-sync
通过github actions每天定时同步语雀文章到github中

## 环境配置
由于保密性，所以设置在[Secrets](https://docs.github.com/cn/actions/reference/encrypted-secrets)中
* `YUQUE_USER_TOKEN=xxx` 语雀开发者token
* `YUQUE_LOGIN=xxx` 语雀账号域名
* `YUQUE_REPOS=xxx` 语雀知识库名称，字符串类型，`,`分割
* `GH_TOKEN=xxx` github token
* `GH_LOGIN=xxx` github 账号域名
* `GH_REPO=xxx` github 项目名称
比如
```
YUQUE_USER_TOKEN=xxx
YUQUE_LOGIN=igsrxe
YUQUE_REPOS=we3pfy
GH_TOKEN=xxx
GH_LOGIN=BcFun
GH_REPO=BcFun-Galaxy
```

## Changelog
### V1.1.0
* 使用知识库的名字作为文件夹目录
* 脑图文档使用图片代替
* 增加语雀原文地址

### V1.3.0
* 引入了语雀的目录结构
* 删除语雀已经删除的文章