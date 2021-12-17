const { GH_TOKEN, GH_LOGIN, GH_REPO } = process.env;
const GitHub = require('github-api');
function handler(res) {
    const result = res ? res.data : {};
    result.status = false;
    result.code = res ? res.status : -1;
    console.error(result)
    return result;
}

class GitHubClient extends GitHub {
    constructor() {
        super({
            token: GH_TOKEN
        });
        this.repo = this.getRepo(GH_LOGIN, GH_REPO)
    }

    async getContent (filename) {
        let res;
        try {
            console.log(`获取 git ${filename}`)
            const { data } = await this.repo.getContents('master', filename, true)
            res = { status: true, data }
        } catch (error) {
            res = handler(error.response)
        }
        return res;
    }

    async writeFile (name, content ) {
        let res;
        try {
            const { data } = await this.repo.writeFile('master', name, content, `update file ${name}`)
            res = { status: true, data }
        } catch (error) {
            res = handler(error.response || { message: error.message })
        }
        return res;
    }
    async delFile(path) {
        let res;
        try {
            console.log(`to delete ${path}`);
            const { data } = await this.repo.deleteFile('master', encodeURI(path))
            res = { status: true, data }
        } catch (error) {
            console.error(error);
            res = handler(error.response || { message: error.message })
        }
        return res;
    }
    async getFileSha(path) {
        let res;
        try {
            const { data } = await this.repo.getSha('master', path)
            res = { status: true, data }
        } catch (error) {
            console.info("获取sha失败 " + path);
            res = handler(error.response)
        }
        return res;
    }
    async getFileTree(sha) {
        let res;
        try {
            const { data } = await this.repo.getTree(sha)
            res = { status: true, data }
        } catch (error) {
            console.error(error)
            res = handler(error.response)
        }
        return res;
    }
}

module.exports = GitHubClient;
