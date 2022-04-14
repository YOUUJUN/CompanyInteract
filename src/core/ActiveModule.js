import {fn} from "./Utils";

class ActiveModule {
    _amn = '';
    context = null;//engine
    ados = null;
    mapping = null;
    view = null;

    constructor(amn, context) {
        this._amn = amn;
        this.ados = {};
        this.context = context;
        this.mapping = {};
        this.view = {};//视图名到数据对象的映射
    }

    /**
     *
     * @param name 数据对象名
     * @param rows 数据行名
     * @param vars 数据对象变量名
     */
    mappingData(name, rows, vars, options) {
        name = fn.convertName(name);
        this.mapping[name] = {rows: rows, vars: vars || ''};
        options = options || {};
        //如没有指定匹配的view，则默认为当前ado
        options['view'] = options['view'] || name;
        if (options['view']) {
            this.view[fn.convertName(options['view'])] = name;
            let w=options['write'];
            if (w){
                if (typeof w=='string'){
                    w=fn.convertName(w).split(",");
                    options['write']=w;
                }else if (typeof w=='array'){
                    for (let i=0;i<w.length;i++){
                        w[i]=fn.convertName(w[i]);
                    }
                }
            }
        }
    }

    getADO = (name) => {
        name = fn.convertName(name);
        return this.ados[name];
    }

    /**
     * 增加数据对象，如果没有在adapter中配置，则忽略且返回 false
     * @param ado
     * @returns {boolean}
     */
    addADO = (ado) => {
        let name = ado.getName();
        name = fn.convertName(name);
        if (this.mapping[name]) {
            if (!this.ados[name]) {
                this.ados[name] = ado;
            }
            return true;
        }
        return false;
    }

    /**
     * 此处的view视同ado的name
     * @param name view的name
     * @param options
     */
    changeViewProperty(viewname, options) {
        let text = null, value = null;
        viewname = fn.convertName(viewname);
        let name = this.view[viewname];
        if (name) {
            //通过视图名找数据对象
            let map = this.mapping[name];
            if (map) {
                //存在数据对象的定义
                let vars = this.context.vue.$data[map['vars']];
                let ado = this.getADO(name);
                if (ado && vars) {
                    for (let k in options) {
                        if (k.startsWith("/")) {
                            text = options[k]['listData'];
                            //要判断text是否为plainObject
                            value = {};
                            if (text) {
                                value = this.context.parseListData(text);
                            }
                            vars[this.context.fn.convertName(k.substring(1))] = value;
                        }
                    }
                    return true;
                }
            }
        }
        return false;
    };


    /**
     * 从服务器端就收数据(ADO的修改或整体数据)，输出到接口
     * @param ado
     * @param data 数据{type:'refresh'/edit,rows:[],clear:false/true，vars:{}}
     * @param isclear
     */
    outData(ado, isclear) {
        //必须事先已经建立映射关系
        let data = ado.getReflectData();
        if (data) {
            let name = ado.getName();
            let mpname = this.mapping[name];
            let rows0 = null;
            if (mpname) {
                rows0 = this.context.getMV().$data[this.mapping[name]['rows']];
            } else {
                throw "ado " + name + " not in adapter !!!";
            }
            if (fn.isPlainObject(rows0)) {
                if (ado.getRowsCount() > 0) {
                    fn.extend(ado.getValuesAt(0, null, true), rows0, true);
                } else {
                    //清除所有的值
                    for (let v in rows0) {
                        delete rows0[v];
                    }
                }
            } else {
                //let rows0 = this.context.getMV().$data[this[name]['rows']];
                if (data.type == 'refresh') {
                    if (!!data.clear) {
                        rows0.splice(0, rows0.length);
                    }
                    data.rows.forEach((item) => {
                        rows0.push(item)
                    })
                } else {
                    let row = 0, rowid = -1, status = '0', rows = data.rows;
                    //ROW_ADD: '2',ROW_EDIT: '1',ROW_DELETE: '3'
                    for (let i = 0; i < rows.length; i++) {
                        rowid = rows[i].__rowid;
                        status == rows[i].__status;
                        row = fn.arrayFind(rows0, '__rowid', rowid);
                        if (status == '1') {
                            //修改
                            if (row >= 0) {
                                fn.extend(rows[i], rows0[row], true);
                            }
                        } else if (status == '2') {
                            if (row >= 0) {
                                //修改
                                fn.extend(rows[i], rows0[row], true);
                            } else {
                                //增加
                                let next = rows[i].__nextrow;
                                if (next >= 0) {
                                    rows0.splice(next, 0, rows[i]);
                                } else {
                                    rows0.push(rows[i]);
                                }
                            }
                        } else if (status == '3') {
                            //删除
                            if (row >= 0) {
                                rows0.splice(row, 1);
                            }
                        }
                    }
                }
            }
            let vars = data['vars'];
            if (vars) {
                //vars 中的变量名是区分大小写的
                let vars0 = this.context.vue.$data[this.mapping[name]['vars']];
                if (vars0) {
                    for (let i in vars) {
                        vars0[i] = vars[i];
                    }
                }
            }
        }
    }

    inData(ado) {
        let cols = null;
        let name = ado.getName();
        let map = this.mapping[name];
        if (map) {
            if (map['options']) {
                cols = map['options']['write'];
            }
            let row;
            let rows = this.context.getMV().$data[map['rows']];
            if (fn.isPlainObject(rows)) {
                row = ado.findRowByRowID(rows.__rowid);
                if (row >= 0) {
                    ado.setValuesAt(row, rows, cols);
                }
            } else {
                let idRows = ado.getRowIDMap();
                for (let i = 0; i < rows.length; i++) {
                    row = idRows(rows[i].__rowid);
                    if (!cols) {
                        for (let j = 0; j < cols.length; j++) {
                            ado.setValueAt(row, cols[j], rows[i][cols[j]]);
                        }
                    } else {
                        ado.setValuesAt(row, rows[i]);
                    }
                }
            }
        }
    }

    release = () => {
        if (this.context) {
            for (let i in this.ados) {
                this.ados[i].release();
            }
            this.ados = null;
            this.mapping = null;
            this.context = null;
        }
    }
}

export default ActiveModule;
