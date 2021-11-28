const lodash = require('lodash');
const Queue = require('queue');
const filenamify = require('filenamify');
const YuqueClient = require('./yuque');
const GitHubClient = require('./github')
const { isPost, decoratePost, formatRaw, formatDate } = require('./utils');

// 需要提取的文章属性字段
const PICK_PROPERTY = [
    'id',
    'title',
    'description',
    'created_at',
    'updated_at',
    'published_at',
    'format',
    'slug',
    'last_editor'
];

class Downloader {
    constructor(repo) {
        this.client = new YuqueClient(repo);
        this.gh = new GitHubClient();
        this.repo_slug = repo;
        this.repo_name = '';
        this._cachedFiles = {};
        this._updateFiles = [];
        this.fetchArticle = this.fetchArticle.bind(this);
        this.generatePost = this.generatePost.bind(this);
        this.lastGenerate = 0;
    }

    /**
     * 下载文章详情
     *
     * @param {Object} item 文章概要
     * @param {Number} index 所在缓存数组的下标
     *
     * @return {Promise} data
     */
    fetchArticle(item, index) {
        const { client, _updateFiles } = this;
        return async function () {
            console.log(`download file body: ${item.title}`);
            const { data } = await client.getArticle(item.slug)
            data._fullName = item._fullName;
            _updateFiles[index] = data;
        };
    }

    /**
     * 下载所有文章
     * 并根据文章是否有更新来决定是否需要重新下载文章详情
     *
     * @return {Promise} queue
     */
    async fetchArticles() {
        const { lastGenerate, client, _cachedFiles, _updateFiles } = this;
        const docs = await client.listArticles();
        const tocs = await client.listToc().data;
        if (!Array.isArray(docs.data)) {
            throw new Error(`fail to fetch doc list, response: ${JSON.stringify(docs)}`);
        }
        const realDocs = docs.data
            .map(doc => lodash.pick(doc, PICK_PROPERTY));
        console.log(`doc amount: ${realDocs.length}`);
        // 并发数
        const queue = new Queue({ concurrency: 5 });

        let file;
        let fileIndex;

        const findIndexFn = (item) => item.slug === file.slug;
        let idToToc = new Map();
        let uuidToPath = new Map();
        // 获取toc结构
        for (let i = 0; i < tocs.length; i++) {
            let perToc = tocs[i];
            idToToc.set(perToc.id, perToc);
            let parentName = '';
            if (perToc.parent_uuid && perToc.parent_uuid.length > 0 && uuidToPath.get(perToc.parent_uuid)) {
                parentName = uuidToPath.get(file.parent_uuid);
            }
            if (parentName.length > 0) {
                path = `${parentName}/${file.title}`;
            } else {
                path = filenamify(file.title);
            }
            uuidToPath.set(perToc.uuid, path);
        }
        console.log("path==========" + JSON.stringify(uuidToPath));
        for (let i = 0; i < realDocs.length; i++) {
            file = realDocs[i];
            let perToc = idToToc.get(file.id);
            let parentName = '';
            if (perToc.parent_uuid && perToc.parent_uuid.length > 0 && uuidToPath.get(perToc.parent_uuid)) {
                parentName = uuidToPath.get(file.parent_uuid);
            }
            if (parentName.length > 0) {
                file._fullName = `${parentName}/[${formatDate(file.created_at)}] ${filenamify(file.title)}.md`
            } else {
                file._fullName = `[${formatDate(file.created_at)}] ${filenamify(file.title)}.md`
            }
            console.log("file===" + file._fullName);
            if (perToc.type == 'DOC') {
                if (+new Date(file.updated_at) > lastGenerate || (!_cachedFiles[file._fullName] && _updateFiles.findIndex(findIndexFn) < 0)) {
                    fileIndex = _updateFiles.length;
                    _updateFiles.push(file);
                    queue.push(this.fetchArticle(file, fileIndex));
                }
            }
        }

        return new Promise((resolve, reject) => {
            queue.start(function (err) {
                if (err) return reject(err);
                console.log('=========download files done!=========');
                resolve();
            });
        });
    }

    /**
     * 读取语雀的文章缓存 json 文件
     */
     async readCache() {
        const { client, gh, repo_slug } = this;
        // 获取知识库信息
        const list = await client.listRepo();
        const yuque_repos = lodash.keyBy(list.data, 'slug');
        this.repo_name = yuque_repos[repo_slug].name;
        // 获取 github 列表
        const { status, code, data } = await gh.getContent(this.repo_name);
        if (!status) return
        this._cachedFiles = lodash.keyBy(data, 'name');
    }

    /**
     * 生成一篇 markdown 文章
     *
     * @param {Object} post 文章详情
     */
    generatePost(post) {
        const { lastGenerate, client, gh, repo_name } = this;
        return async function () {
            if (!isPost(post)) {
                console.error(`invalid post: ${post}`);
                return;
            }
            const { title, slug, format, cover, _fullName, updated_at, body } = post

            // 文章更新时间判断
            if (+new Date(updated_at) < lastGenerate) {
                console.log(`post not updated skip: ${title}`);
                return;
            }

            let mdBody = formatRaw(body);
            // 脑图处理
            if (format === 'lakeboard' && cover) {
                mdBody = `![${title}](${cover})`
            }
            const content = decoratePost(title, mdBody, `https://www.yuque.com/${client.namespace}/${slug}`)
            await gh.writeFile(`${repo_name}/${_fullName}`, content)
            console.log(`updated file: ${_fullName}`);
        };
    }

    /**
     * 生成 markdown，并提交到 github
     * 顺序提交，否则会冲突
     */
    async generatePosts() {
        const { _updateFiles } = this;
        const queue = new Queue({ concurrency: 1 });

        _updateFiles.forEach((post) => {
            queue.push(this.generatePost(post))
        });

        return new Promise((resolve, reject) => {
            queue.start((err) => {
                if (err) return reject(err);
                console.log('=========commit files done!=========');
                resolve();
            });
        });
    }

    // 文章下载 => 读取已经保存的文章 => 全量生成 markdown 文章 => push 到 github
    async autoUpdate() {
        // 获取上次更新时间
        const { data } = await this.gh.getContent('update.json')
        this.lastGenerate = data ? data.time : 0;
        await this.readCache();
        await this.fetchArticles();
        await this.generatePosts();
        console.log(`=========[${this.repo_name}] sync completed!=========`)
    }
}

module.exports = Downloader;