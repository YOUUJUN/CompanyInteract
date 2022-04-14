import ADOAgent from './AdoModule.js';
import ActiveModule from './ActiveModule.js';
import fly from './WebModule.js';

import {fn, errorCaptured} from './Utils.js';
const {randNum} = fn;
import {openWindow as $openWindow, getEventChannel} from './plugins/index.js';


class Engine {
    _inited = false;
    _amgn = null;
    _checkid = null;
    _lifeType = 'keep';
    // _uuid = '';
    envs = {};
    ams = {};
    fn = fn;
    vue = null;

    constructor(vue, adapter) {
        this.vue = vue;
        // this._uuid = randNum();

        if (adapter) {
            let am = null;
            for (let amn in adapter) {
                am = new ActiveModule(amn, this);
                if (adapter[amn]['group']) {
                    this._amgn = amn;
                }
                // 映射数据对象数据
                let ados = adapter[amn]['ados'];
                if (ados) {
                    let a1 = null;
                    for (let name in ados) {
                        a1 = ados[name];
                        am.mappingData(name, a1['rows'], a1['vars'] || '', a1['options']);
                    }
                }
                // 缓存amn
                this.ams[amn] = am;
            }
        }
    }

    // 初始化，外部驱动
    init = async (amgn, amn, checkid, options = {}) => {
        this._amgn = amgn || this._amgn;
        amn = amn || this._amgn;

        if (checkid) {
            this._checkid = checkid;
        }
        let act = options['_act'] || "";
        if (!this._inited || (!this._checkid) || (checkid != this._checkid)) {
            return await this.request(amn, "reg_am", act, null, null, options);
        } else if (act) {
            return await this.request(amn, "call", act, null, null, options);
        }
        console.log('well');
    }

    initEnd = (options) => {
        options = options || this.envs;
        this._public = options['public'] || false;
        this._lifeType = (options['lifeType'] || 'keep') == 'keep';
        this._inited = true;
    }
    forActiveCell = (props, cell) => {
        cell.name = cell.name || props.name;
        cell._mn = props._mn;
        cell._amn = props._amn;
    }
    // 判断是否为同一个$e
// isSame = (uuid) => {
// return this._uuid == uuid;
// }
    getActiveModule = (name) => {
        name = fn.convertName(name);
        return this.ams[name];
    }

    getADO = (name, amn) => {
        name = fn.convertName(name);
        let am = this.getActiveModule(amn || this._amgn);
        return am ? am.getADO(name) : null;
    }

    getEnv = (name) => {
        return this.envs[name];
    }
    /**
	 *
	 * @param amn
	 * @param type
	 *            call/async
	 * @param action
	 *            动作名
	 * @param options
	 * @param norand
	 *            不生成随机码
	 * @returns {*}
	 */
    buildURL = (amn, type, action, options, norand) => {
        let settings = {
            _amgn: this._amgn,
            _amn: amn || this._amgn,
            _name: action,
            _type: type,
            _checkid: this._checkid
        };
        options = options || {};
        settings._hasdata = (options.hasdata == undefined) ? '0' : options.hasdata;
        if (options.params) {
            fn.extend(options.params, settings, true);
        }
        return this.serialURL(settings, !!norand);
    }

    serialURL = (url, norand) => {
        if (fn.isPlainObject(url)) {
            url = fn.extend(url, {});
            if (!norand) {
                url._rand = randNum();
            }
            let url1 = url._baseURI || (this._baseURI + "cloud?");
            delete url['_baseURI'];
            let type, value;
            let link = url1.indexOf('?') >= 0;
            for (let key in url) {
                type = (typeof key);
                if (typeof type == 'string' || type instanceof String) {
                    value = url[key] + '';
                    type = (typeof value);
                    if ((value instanceof String) || (type != 'function' && type != 'object' && type != 'array')) {
                        if (!link) {
                            url1 += "?";
                            link = true;
                        }
                        url1 = url1 + '&' + encodeURIComponent(key) + '=' + encodeURIComponent((value || '') + '');
                    }
                }
            }
            url = url1.replace('?&', '?');
        }
        return url;
    }

    getURL = (type, options, hasdata, noid) => {
        options = options || {};
        fn.extend(
            {
                _hasdata: fn.getBoolean(hasdata) ? "1" : "0",
                _type: type,
                _amgn: this._amgn,
                _baseURI: this._baseURI + "cloud?",
                _checkid: this._checkid || ''
            }, options);
        return this.serialURL(options, noid);
    }

    /**
	 * 返回数组类型的[{label:'xxx',value}]
	 *
	 * @param text
	 * @param p1
	 * @param p2
	 * @returns {{}}
	 */
    parseListData(text, p1, p2) {
        let data = [];
        if (text) {
            if (typeof (text) == 'string') {
                let vs = text.split(p1 || ";");
                p2 = p2 || "/";
                for (let i = 0; i < vs.length; i++) {
                    let j = vs[i].indexOf(p2);
                    if (j >= 0) {
                        data.push({value: vs[i].substring(0, j), label: vs[i].substring(j + 1)});
                    } else {
                        data.push({value: vs[i], label: vs[i]});
                    }
                }
            } else {
                data = text;
            }
        }
        return data;
    }

    // type, name, ados, jsondata, options
    call = async (amn, name, ados, jsondata, options) => {
        return await this.request(amn, "call", name, ados, jsondata, options);
    };

    selfCall = async (amn, name, ados, jsondata, options) => {
        return await this.request(amn, "async", name, ados, jsondata, options);
    };

    buildData = (amn, ados, jsondata) => {
        let data = {};
        if (ados) {
            data.ados = this.getEditADOData(amn, ados);
        }
        if (jsondata) {
            data.data = jsondata;// (rowsparm instanceof
            // Array)?rowsparm:[rowsparm];
        }
        return fn.isEmptyObject(data) ? null : data;
    }
    getEditADOData = (amn, ados) => {
        let data = [];
        if (ados) {
            let ado, names, am;
            names = (ados instanceof Array) ? ados : ados.split(",");
            for (let i = 0; i < names.length; i++) {
                am = this.getActiveModule(amn);
                if (am) {
                    ado = am.getADO(names[i]);
                    if (ado) {
                        am.inData(ado);
                        // 此处只有存在该数据对象时,才获取同步数据
                        let adata = ado.getUpdateData();
                        if (adata) {
                            data.push(adata);
                        }
                    }
                }
            }
        }
        return data;
    }

    loadData = (s) => {
        if (s) {
            let cells;
            if ((typeof (s) === "string") || (s instanceof String)) {
                if (!s.startsWith("{") || !s.endsWith("}")) {
                    return;
                }
                cells = JSON.parse(s);
            } else {
                cells = s;
            }
            let name, amn, view, ado;
            // env
            let envs = cells['envs'];
            // var onLoadScript = cells['onLoad'];
            var cbps = cells["cbps"];// 回调函数的参数
            if (envs && !fn.isEmptyObject(envs)) {
                if (envs["_checkid"]) {
                    this._checkid = envs["_checkid"];
                    delete envs["_checkid"];
                }
                if (!fn.isEmptyObject(envs)) {
                    // this.setEnvs(envs, true);
                    this.transParent({
                        type: 'env',
                        isParent: false,
                        data: envs,
                        _amgn: this._amgn
                    },true);
                }
            }

            var ados = cells['ados'];
            var prop;// , mkados = [];
            var ds = '', am = null;
            if (ados && ados.length > 0) {
                // 数据对象定义
                for (let i = 0; i < ados.length; i++) {
                    // 创建db
                    prop = ados[i];
                    if (prop) {
                        name = prop.name;
                        amn = prop._amn;
                        am = this.getActiveModule(amn);
                        if (am) {
                            if (!am.getADO(name)) {
                                // 没有建立ycdb
                                ado = new ADOAgent(name, this);
                                ado.init(prop);
                                am.addADO(ado);
                            }
                        }
                    }
                }
            }
            // data,初始是reload
            var data = cells['data'];
            if (data && data.length > 0) {
                // 一个或多个ADOAgent的数据
                ds = [];
                for (let i = 0; i < data.length; i++) {
                    if (data[i]) {
                        name = data[i].name;
                        amn = data[i]._amn;
                        ado = this.getADO(name, amn);
                        if (ado) {
                            ado.loadData(data[i]);
                            ds.push(ado);
                        } else if (!this.getActiveModule(amn)) {
                            this.transParent({
                                type: 'ado',
                                isParent: false,
                                data: data[i],
                                name: name,
                                _amn: amn,
                                _amgn: this._amgn
                            },true);
                        }
                    }
                }
            }
            if (ds) {
                for (let i = 0; i < ds.length; i++) {
                    am = this.getActiveModule(ds[i].getActiveModuleName());
                    if (am) {
                        am.outData(ds[i], true);
                    }
                }
            }
            if (envs && !fn.isEmptyObject(envs)) {
                fn.extend(envs, this.envs, true, true);
                this.vue.$data.envs = this.envs;
                // if(this.vue.envs){
                // fn.extend(envs, this.vue.$data.envs, true, true);
                // }
            }
            let ld = cells["view_or"];
            if (ld) {
                let viewData = null, apapter = null;
                for (amn in ld) {
                    let vs = ld[amn];
                    am = this.getActiveModule(amn);
                    if (am) {
                        for (var vn in vs) {
                            // if (am.getADO(vn)) {
                            am.changeViewProperty(vn, vs[vn]['_child_or'] ? vs[vn]['_child_or'] : vs[vn]);
                            // } else {
                            // transParent
                            // }
                        }
                    }
                }
            }
        }
    }

    /**
	 * 目前仅对uni-app提供支持
	 *
	 * @options { type: 'ado', isParent: false, data: data[i], name: name, _amn:
	 *          amn, _amgn: this._amgn _chechid:12345 }
	 * @only
	 * @return 0/需要继续传递；1/传递完成，终止；-1/没有适配到组件，终止
	 */
    transParent = (options, toparent) => {
        let result = 0;
        if ((this._amgn == options._amgn) && (this._checkid == options._chechid)) {
            // 必须要处于同一个group和_checked;
                let ado = null;
                if (toparent) {
                    // 仅仅触发当前的
                        // 不是当前触发的

                    let eventChannel = getEventChannel.call(this.vue);
                    console.log('eventChannel',eventChannel);
                	if (eventChannel){
                        eventChannel.emit('_callback',options);
                	}
                } else {
                	let type=options.type;
                    if (type == 'ado') {
                        ado = this.getADO(options.name, options._amn);
                        if (ado) {
                            ado.loadData(options.data);
                            this.getActiveModule(options._amn).outData(ado, true);
                            return 1;
                        }
                    } else {
                        this.fn.extend(options.data, this.envs, true);
                    }
                    this.transParent(options,true);
                }
            return result;
        } else {
            return -1;
        }
    }

    request = async (amn, type, name, adosname, jsondata, options) => {
        // 获取需要同步的数据对象action, param, data
        amn = (amn || this._amgn);
        let data = this.buildData(amn, adosname, jsondata);
        // 执行服务器端调用,主动分析返回的数据,做相关的处理,顺序是先处理同步数据,再显示同步消息
        // 如1.数据保存后,返回的同步信息
        // 2.在刷新数据对象时,更新本地缓存的数据
        // 3.其他方式下,执行服务器端调用后,同步返回的信息
        let settings = {
            _baseURI: "cloud?",
            _amgn: this._amgn,
            _amn: amn || this._amgn,
            _name: name,
            _type: type,
            _hasdata: (data ? "1" : "0"),
            _checkid: this._checkid
        };

        if (options.params) {
            fn.extend(options.params, settings, true);
            delete options.params;
        }

        return await this.ajax(settings, data, options);
    };

    // 处理默认的系统消息
    defaultError = (err) => {
        if (err.code == 101) {
            // fn.showModal('信息提示', err.message || err.msg);
        } else if (err.code == 111) {
            this.exitSystem();
        } else {
            // fn.showModal('信息提示', '错误代码：' + err.code + "," + (err.message ||
			// err.msg));
        }
    }
    // 退出系统，重新登录
    exitSystem = () => {
        // this.showModal('系统提示', '网络连接超时，请您重新登录', {
        // method: function () {
        // //退出app
        // //#ifdef APP-PLUS
        // if (plus.os.name.toLowerCase() === 'android') {
        // plus.runtime.quit();
        // } else {
        // const threadClass = plus.ios.importClass("NSThread");
        // const mainThread = plus.ios.invoke(threadClass, "mainThread");
        // plus.ios.invoke(mainThread, "exit");
        // }
        // //#endif
        // }
        // });
    }
    release = () => {
        if (this.ams) {
            for (let i in this.ams) {
                this.ams[i].release();
            }
            this.ams = null;
            this.vue = null;
            this.envs = null;
        }
    }

    parseError = (res) => {
        let msg = "";
        switch (res.status) {
            case 400:
                msg = "错误请求";
                break;
            case 401:
                msg = "访问拒绝";
                break;
            case 403:
                msg = "拒绝访问";
                break;
            case 404:
                msg = "请求错误，未找到该资源";
                break;
            case 405:
                msg = "请求方法未允许";
                break;
            case 408:
                msg = "请求超时";
                break;
            case 500:
                msg = "服务器端出错";
                break;
            case 501:
                msg = "网络未实现";
                break;
            case 502:
                msg = "网络错误";
                break;
            case 503:
                msg = "服务不可用";
                break;
            case 504:
                msg = "网络超时";
                break;
            case 505:
                msg = "http版本不支持该请求";
                break;
            default:
                msg = "http 未知错误！";
                break;
        }
        return {code: res.status, message: msg};
    }


    /**
     *
     * @param ajaxUrl
     * @param postData
     * @param options
     *            {setting:{method:"GET"}}
     * @param resolve
     * @param reject
     */
     ajax = async (urlParams, postData, options) => {

         let self = options['parseSelf'] ? true : false;
         let url = this.serialURL(urlParams);

         try{
             let res = await fly.request(url, postData, {method: 'POST'});

             if(res){
                 if (self) {
                     // 自己解析数据
                     return res.data;
                 } else {
                     this.loadData(res.data);
                     let err = res.data['error'];
                     if (err) {
                         if (err.code == 111) {
                             this.exitSystem();
                             return;
                         }
                         throw err;
                     } else if (res.data['message'] || res.data['msg']) {
                         // 提示性信息按异常处理
                         throw {code: 101, message: (res.data['message'] || res.data['msg'])};
                     } else {
                         // 返回的参数ind(
                         return res.data['cbps'] || {};
                     }
                 }
             }

         }catch (err) {
             throw this.parseError(err);
         }

    };



    getMV = () => this.vue;

    openWindow = (url, options, name) => {
        $openWindow.call(this, url, options, name);
    }

}


export default Engine;
