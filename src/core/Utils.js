import * as plugins from './plugins/index.js';

if (!Array.prototype.rangeCheck) {
    Array.prototype.rangeCheck = function (i) {
        if ((this.length > 0) && (i >= 0 && i < this.length)) {
            return true;
        }
        return false;
    };
}

/**
 *
 *
 * @param item 判断item类型
 * @param type
 * @returns {*|boolean}
 */
export function isTypeOf (item, type){
    const map = {
        array: 'Array',
        object: 'Object',
        function: 'Function',
        string: 'String',
        null: 'Null',
        undefined: 'Undefined',
        boolean: 'Boolean',
        number: 'Number'
    };

    let stringType = Object.prototype.toString.call(item).slice(8, -1);
    return map[type] && stringType === map[type];
}

/**
 * better error handler for async func
 *
 * @param asyncFunc
 * @param params
 * @returns {Promise<*[]>}
 */
export async function errorCaptured(asyncFunc, ...params){
    try{
        let res = await asyncFunc(...params);
        return [null,res];
    }catch (e) {
        return [e, null];
    }
}

/**
 *
 * @param target   被拷贝子对象
 * @param source   继承父对象
 * @param overwrite     是否覆盖子对象已有属性
 * @param isdeep    是否深度继承
 * @returns {any}
 *
 */

export function extend(target = {}, source ={}, overwrite = true, isdeep = true) {

    for(let key in source){
        if(isdeep && typeof source[key] === 'object'){
            if((target.hasOwnProperty(key) && overwrite) || !target.hasOwnProperty(key)){
                target[key] = isTypeOf(source[key], 'array') ? [] : {};
                extend(target[key], source[key]);
            }
        }

        if(!isdeep || (isdeep && !(typeof source[key] === 'object'))){
            if((target.hasOwnProperty(key) && overwrite) || !target.hasOwnProperty(key)){
                target[key] = source[key];
            }
        }
    }

    return target;
}

const fn = Object.assign({}, {
    reg_fmt: {},
    convertName(name) {
        return name ? name.toLowerCase() : name;
    },
    getInt: function (s, defa) {
        s = parseInt(s);
        s = isNaN(s) ? (arguments.length > 1 ? defa : 0) : s;
        return s;
    },
    getFloat: function (s, defa) {
        s = parseFloat(s);
        s = isNaN(s) ? (arguments.length > 1 ? defa : 0.0) : s;
        return s;
    },
    //为什么只有'1'， 返回true，
    getBoolean: function (s1, defa) {
        if (s1 == null || s1 == undefined) {
            s1 = (defa == null || defa == undefined) ? false : defa;
        }
        return ((s1 == 1) || (s1 == '1') || (s1 == 'true') || (s1 === true)) ? true : false;
    },
    /**
     * 统计text包含的c1个数
     * @param text
     * @param c1
     */
    countChar: function (text, c1) {
        let c = 0;
        if (text) {
            for (let i = 0; i < text.length; i++) {
                if (text.charAt(i) == c1) {
                    c++;
                }
            }
        }
        return c;
    },
    toast: function (text, icon, duration) {
        uni.showToast({
            title: text || "出错啦~",
            icon: icon || 'none',
            duration: duration || 2000
        })
    },
    //title, content, showCancel = false, callback, confirmColor, confirmText, cancelColor, cancelText
    showModal: function (title, content, confirm, cancel) {
        let hasConfirm = !!confirm;
        let hasCancel = !!cancel;
        uni.showModal({
            title: title || '提示',
            content: content,
            confirmColor: hasConfirm ? (confirm.color || "#e41f19") : "#e41f19",
            confirmText: hasConfirm ? (confirm.text || "确定") : "确定",
            showCancel: hasCancel,
            cancelColor: hasCancel ? (cancel.color || "#555") : "#555",
            cancelText: hasCancel ? (cancel.text || "取消") : "取消",
            success(res) {
                if (res.confirm) {
                    if (hasConfirm && confirm.method) {
                        confirm.method();
                    }
                } else {
                    if (hasCancel && cancel.method) {
                        cancel.method();
                    }
                }
            }
        })
    },
    /**
     * 获取实际匹配类型的值,有待扩展
     *
     * @param type
     *            类型
     * @param prec
     *            精度
     * @param value
     *            值
     * @returns
     */
    parseValue: function (value, type, prec) {
        if (value + '') {
            prec = prec || 0;
            switch (type) {
                case 'boolean':
                    value = this.getBoolean(value, false);
                    break;
                case 'string':
                    value = (prec > 0 && value.length > prec) ? value.substring(0, prec) : value;
                    break;
                case 'decimal':
                case 'number':
                    if (typeof value == 'string') {
                        value = value.replace(/,/g, "");
                    }
                    if (isNaN(value)) {
                        value = null;
                    } else if ((typeof value) != 'number') {
                        value = parseFloat(value);
                    }
                    if (arguments.length > 2 && value) {
                        value = value.toFixed(prec) - 0;
                    }
                    break;
                case 'date':
                case 'datetime':
                case 'time':
                    if (!(value instanceof Date)) {
                        if (typeof value == 'number' || !isNaN(value)) {
                            value = new Date(parseFloat(value));
                        } else {
                            let mils = 0;
                            if (typeof(value) == 'string') {
                                let p = value.indexOf('.');
                                if (p > 0) {
                                    mils = parseInt(value.substring(p + 1));
                                    value = value.substring(0, p);
                                }
                                if (value.indexOf('-') > 0) {
                                    value = value.replace(new RegExp(/-/gm), "/");
                                }
                            }
                            value = new Date(value);
                            if (mils > 0) {
                                value.setMilliseconds(mils);
                            }
                        }
                    }
                    if (value && (type == "date")) {
                        value.setHours(0, 0, 0, 0);
                    }
                    break;
                case 'int':
                case 'integer':
                case 'long':
                    if (isNaN(value)) {
                        value = null;
                    } else {
                        value = parseFloat(value).toFixed(0) - 0;
                    }
                    break;
                default:
                    break;
            }
        }
        return value;
    },
    /**
     * 将日期或日期类型的变量格式化成指定类型的字符串
     *
     * @param date
     * @param f
     * @returns
     */
    formatDate: function (date, ftext) {
        //TODO
        if (date && !(date instanceof Date)) {
            date = this.parseValue(date, 'datetime');
        }
        if (date && date instanceof Date) {
            ftext = ftext ? ftext : "yyyy-MM-dd HH:mm:ss";
            let o = {
                "M+": date.getMonth() + 1,
                "d+": date.getDate(),
                "H+": date.getHours(),
                "h+": date.getHours() > 12 ? date
                    .getHours() - 12 : date.getHours(),
                "m+": date.getMinutes(),
                "s+": date.getSeconds(),
                "q+": Math
                    .floor((date.getMonth() + 3) / 3),
                "f+": date.getMilliseconds()
            };
            if (/(y+)/.test(ftext)) {
                ftext = ftext.replace(RegExp.$1, (date
                    .getFullYear() + "")
                    .substr(4 - RegExp.$1.length));
            }
            for (let k in o) {
                if (new RegExp("(" + k + ")").test(ftext)) {
                    ftext = ftext
                        .replace(
                            RegExp.$1,
                            RegExp.$1.length == 1 ? o[k]
                                : ((k.charAt(0) == 'f' ? "000"
                                : "00") + o[k])
                                    .substr(("" + o[k]).length));
                }
            }
            return ftext;
        }
        return "";
    },

    /**
     * 分割符必须为/或-
     *
     * @param s
     * @returns
     */
    isDateText: function (s) {
        if (s && (s + '').trim() && !!isNaN(s)) {
            let date = new Date(s);
            return !isNaN(date.getDay());
        }
        return false;
    },
    /**
     * 格式化数字
     *
     * @param num
     * @param pattern
     * @returns
     */
    formatNumber: function (num, ftext) {
        if (typeof (num) == "string") {
            num = num.replace(/,/g, "");
        }
        num = parseFloat(num);
        if (isNaN(num) || num == null) {
            return '';
        }
        let str = '';
        if (num || num === 0) {
            if (!ftext) {
                return num + '';
            }
            let fmt = ftext = ftext.trim();
            if (fmt.endsWith("%")) {
                num = num * 100;
                fmt = fmt.substr(0, fmt.length - 1);
            }
            let split = false;
            fmt = fmt.split('.');
            if (fmt.length > 1) {
                // 有小数,四舌五入
                num = num.toFixed(fmt[1].length);
            } else {
                num = num.toFixed(0);
            }
            let p = fmt[0].lastIndexOf(",");
            if (p >= 0) {
                fmt[0] = fmt[0].substring(p + 1);
                split = (fmt[0].length > 0);
            }
            let str_num = num.split('.');
            if (split) {
                str = str_num[0].replace(this.getRegExp(fmt[0].length), "$1,");
            } else {
                //无分节号
                str = str_num[0];
            }
            if (str_num.length > 1 && fmt.length > 1) {
                //有小数
                let i = str_num[1].length - 1;
                while (i >= 0) {
                    if (str_num[1].charAt(i) != '0' || fmt[1].charAt(i) != '#') {
                        break;
                    }
                    i--;
                }
                if (i >= 0) {
                    str = str + "." + str_num[1].substring(0, i + 1);
                }
            }
            str = (str == '-') ? '' : str;
            if ((str.length > 0) && ftext && ftext.endsWith("%")) {
                str = str + "%";
            }
        }
        return str;
    },
    getRegExp: function (type) {
        type = type + '';
        let reg = this.reg_fmt[type];
        if (!reg) {
            this.reg_fmt[type] = reg = new RegExp('(\\d{1,' + type + '})(?=(\\d{' + type + '})+(?:$))', "g");
        }
        return reg;
    },
    /**
     *
     * @param value
     * @param type
     *            string,number,date,datetime,time
     * @param prec
     * @returns
     */
    getDataText: function (value, type, prec) {
        if (value) {
            if (type == "string") {
                // 强制转型
                if (value instanceof Date) {
                    value = this.formatDate(value, "yyyy-MM-dd");
                } else {
                    value = value + '';
                }
                if (prec && prec > 0 && value.length > prec) {
                    value = value.substr(0, prec);
                }
            } else if (type == "number" || type == "int" || type == 'long') {
                value = this.formatNumber(value, "0." + "#".fillText(prec));
            } else if (type == "date") {
                value = this.formatDate(value, "yyyy-MM-dd");
            } else if (type == "datetime") {
                value = this.formatDate(value, "yyyy-MM-dd hh:mm:ss");
            } else if (type == "time") {
                value = this.formatDate(value, "hh:mm:ss");
            }
        }
        return value;
    },

    /**
     * 格式化字符,数字,日期时间类型的文本
     *
     * @param value
     * @param type
     * @param ftext
     * @param prec
     * @returns
     */
    formatData: function (value, ftext, type, prec, focused) {
        if (value) {
            if (!type && this.isDateText(value + '')) {
                type = 'date';
            }
            type = type ? type : typeof (value);
            if (type == "text" || type == 'string') {
                value += "";
                if (ftext == "U" || ftext == 'upper') {
                    value = value.toUpperCase();
                } else if (ftext == "L" || ftext == 'lower') {
                    value = value.toLowerCase();
                }
            } else if (type == "percent"
                || type == 'number' || type == 'int'
                || type == 'long') {
                value = this.formatNumber(value, ftext);
                // 格式化
                if (focused) {
                    // 替换","为空
                    value = value.replace(/,/g, "");
                }
            } else if (type == "date" || type == "datetime" || type == "time") {
                value = this.formatDate(value, ftext);
            }
        }
        return value == null ? '' : value;
    },
    parseVars: function (array) {
        let vars = {};
        if (array && array.length > 0) {
            let v1;
            for (let i = 0; i < array.length; i++) {
                v1 = array[i];
                vars[v1.name] = this.parseValue(v1.value, v1.type);
            }
        }
        return vars;
    },
    plainObj: {
        string: {}.hasOwnProperty.toString.call(Object)
    },
    isPlainObject: function (obj) {
        if (!obj || {}.toString.call(obj) !== "[object Object]") {
            return false;
        }
        if (!Object.getPrototypeOf) {
            return true;
        }
        let proto = Object.getPrototypeOf(obj);
        if (this.plainObj.hasOwnProperty.call(proto, "constructor")) {
            return this.plainObj.hasOwnProperty.toString.call(proto.constructor) === this.plainObj.string;
        }
        return false;
    },
    isEmptyObject: function (e) {
        for (let t in e)
            return false;
        return true;
    },
    extend: function (source, target, overwrite, isdeep) {
        if (source && target) {
            overwrite = !!overwrite;
            for (let f in source) {
                //目标对象没有该属性，或overwrite为true
                if ((target[f] == undefined)) {
                    if (this.isPlainObject(source[f])) {
                        target[f] = {};
                        this.extend(source[f], target[f], overwrite, isdeep);
                    } else {
                        target[f] = source[f];
                    }
                } else if (isdeep) {
                    if (this.isPlainObject(source[f])) {
                        if (target[f] == null || !this.isPlainObject(target[f])) {
                            target[f] = {};
                        }
                        this.extend(source[f], target[f], overwrite, isdeep);
                    } else if (overwrite && target[f] !== source[f]) {
                        target[f] = source[f];
                    }
                } else if (overwrite && target[f] !== source[f]) {
                    target[f] = source[f];
                }
            }
        }
        return target;
    },
    composeTree: function (list = []) {
        const data = JSON.parse(JSON.stringify(list)) // 浅拷贝不改变源数据
        const result = []
        if (!Array.isArray(data)) {
            return result
        }
        data.forEach(item => {
            delete item.children
        })
        const map = {}
        data.forEach(item => {
            map[item.id] = item
        })
        data.forEach(item => {
            const parent = map[item.parentId]
            if (parent) {
                (parent.children || (parent.children = [])).push(item)
            } else {
                result.push(item)
            }
        })
        return result
    },

    // 产生随机数
    randNum : function () {
        let today = new Date();
        return Math.abs(Math.sin(today.getTime()));
    },
}, plugins);
delete fn.default;
export {fn};

export const os = {
    isAndroid: function () {
        const res = uni.getSystemInfoSync();
        return res.platform.toLocaleLowerCase() == "android"
    },

    /**
     * 是否iphone
     * @returns {boolean}
     */
    isIphone: function () {
        const res = uni.getSystemInfoSync();
        const model = res.model.replace(/\s/g, "").toLowerCase()
        return model.startsWith('iphone');
    }
};



































