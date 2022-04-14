// import ADOAgent from './ado_module.js';

import {fn} from './utils_module.js';
import {extend as $extend} from "./utils_module";

import $axios from '../web_module.js';


const ado_status = {
    REFRESH: '0',
    ROW_NOEDIT: '0',
    ROW_ADD: '2',
    ROW_EDIT: '1',
    ROW_DELETE: '3',
    EVENT_ALL: '#all'
};

// 该类定义一行的属性（而一行包含n列，其属性有：行的长度/length，状态标示/statusFlag，
// 行的id/rowID---唯一标示该行的属性）
class RowData {
    __rownum = -1;
    __row = -1;

    constructor(len, status, rowid, columnsindex) {
        // 行数据(每一个元素就是一个DataColumn),变量rowData已经过时，只是为了兼容旧版本
        this.__status = this.__status2 = status;
        this.__cellStatus = [];
        this.__rowid = rowid;
        this.__data = new Array(len);
        this.__cols = columnsindex;
    }
}


// 该类定义一列的属性（列名/name，类型/type，默认值/defa）
// order 排列序号
// type:string,date,datetime,int,number
class Column {
    constructor(name, type, precision, defa) {
        this.name = name.toLowerCase();
        this.dataType = type.toLowerCase();
        this.precision = precision;
        this.defa = defa;
    }
}

class DataPage {
    ado = null;
    pages = 1;
    pageRows = 0;
    currentPage = 0;
    refreshRows = 0;

    constructor(ado, pagerows, page, pages) {
        this.ado = ado;
        this.pageRows = pagerows;
        this.changePage(page, pages);
    }

    changePage = (page, pages) => {
        page = page <= 0 ? 0 : page;
        this.currentPage = page;
        this.pages = pages;
    };

    getPageRows = () => this.pageRows;

    /**
     *
     * @param row
     * @returns
     */
    getRowNum = (row) => {
        let num = null;
        if (this.ado.pageLoadReset || this.currentPage <= 0) {
            num = this.currentPage * this.pageRows + row;
        } else {
            num = row;
        }
        return num;
    };

    getRealRow = (row) => {
        let num = null;
        if (this.ado.pageLoadReset || this.currentPage <= 0 || row < this.pageRows || this.pageRows <= 0) {
            num = row;
        } else {
            num = row % this.pageRows;
        }
        return num;
    };

    getPageCount = () => this.pages;

    getCurrentPage = () => this.currentPage;

    getRefreshRows = () => this.refreshRows;

    hasNextPage = () => this.pages > 1 && (this.currentPage < this.pages - 1);

    release = () => {
        this.ado = null;
    }
}

class ADOAgent {
    dataPage = null;
    // 是否存在修改行为
    isEdit = false;
    editCols = null;// 可以修改的列序号
    // 是否正在刷新
    preRowNum = -1;
    vars = null;
    onLoad = null;// 加载完成时的事件函数
    maxRowID = 0;
    context = null;

    constructor(name, context) {
        // 该组件的数据存放使用SelfArray类型的变量作为容器
        this.rows = [];// 主缓存数据
        this.vars = {};// 数据对象变量
        this.columns = [];// 所有的列定义,
        this.colsIndex = {};// 所有的列对应的序号,
        this.name = name;
        this.reflectData = null;//{type:'refresh'/'edit',rows:[],clear:false/true,vars:{}};
        this.context = context
    }

    forActiveCell = (props, cell) => {
        cell.name = cell.name || props.name;
        cell._mn = props._mn;
        cell._amn = props._amn;
    };


    getName = () => {
        return this.name
    }

    getActiveModuleName = () => {
        return this._amn;
    }

    init = (props) => {
        const {columns, updateColumns, pageLoadReset, pageRows, page, pages} = props;
        if (columns) {
            columns.forEach((c1, index) => {
                let column = new Column(c1.name, c1.dataType, c1.precision, c1.defaultValue);
                this.columns.push(column);
                this.colsIndex[column.name] = index;
                this.colsIndex[c1.name] = index;
            })
        }
        this.editCols = updateColumns ? updateColumns.split(",") : [];
        this.pageLoadReset = fn.getBoolean(pageLoadReset, true);
        this.forActiveCell(props, this);

        // 实例化 dataPage
        this.dataPage = new DataPage(this, pageRows, page, pages);
    };

    loadData = ({type, rowsData, vars, page, pages, status = ''}) => {
        let addType = type;
        let chgRow = -1;//, chgRowID = -1;
        // 行数据是个数组
        let rowdata = null;
        let delRows = 0;
        let editRows = 0;
        let addRows = 0;

        try {
            //this.locked = true;
            // 是否转换列名
            this.reflectData = {
                type: (addType == 'refresh' ? 'refresh' : 'edit'),
                rows: [],
                vars: vars,
                clear: false
            };
            switch (addType) {
                case 'refresh':
                    // 刷新,清空数据
                    if (page <= 0 || this.pageLoadReset) {
                        this.reset(true);
                        this.reflectData.clear = true;
                    }
                    // 修改page状态
                    this.dataPage.changePage(page, pages);
                    // this.addDelayEvent(delayEvents, this.buildEventObject(ado_status.REFRESH));
                    this.dataPage.refreshRows = 0;
                    //只有连续分页才有意义
                    break;

                case 'sync':
                    // 同步,状态为服务器端的状态
                    this.clearEdit(status);
                    break;

                default:
                    this.isEdit = (status != ado_status.ROW_NOEDIT);
                    break;
            }

            let isEdit = this.isEdit;
            let editData = null;

            if (rowsData && rowsData.length > 0) {
                // 遍历rowsData
                rowsData.forEach((data, index,) => {
                    let rowid = data.__rowid;
                    let map = {};
                    switch (addType) {
                        case 'refresh':

                            // 初始加载
                            if (!this.pageLoadReset && rowid <= this.maxRowID) {
                                if (this.findRowByRowID(rowid) >= 0) {
                                    //防止重复加入行
                                    return;
                                }
                            }

                            rowdata = this.createDefaultRowData("0", rowid);
                            // 使用别名,
                            // 获取每一行数据
                            this.setRowProperties(rowdata, data, map);
                            // 装载data
                            this.maxRowID = Math.max(this.maxRowID, rowid);
                            this.rows.push(rowdata);
                            this.dataPage.refreshRows++;
                            this.reflectData.rows.push(map);

                            break;

                        default:
                            // sync,edit,del数据同步,保存后修改的值
                            let evt = null, row = this.findRowByRowID(rowid, true);
                            if (row >= 0) {
                                chgRow = row;
                                rowdata = this.getRowData(row, true);
                                status = data.__status;
                                // 修改行的行号，
                                if (status == ado_status.ROW_DELETE) {
                                    this.delRow(row, true, true);
                                    delRows++;
                                    this.reflectData.rows.push({
                                        __rowid: rowdata.__rowid,
                                        __status: ado_status.ROW_DELETE
                                    });
                                } else {
                                    // 用新值覆盖旧值
                                    editData = this.setRowProperties(rowdata, data, map);
                                    editRows++;
                                    this.reflectData.rows.push(map);
                                }
                            } else {
                                // add
                                rowdata = this.createDefaultRowData(ado_status.ROW_ADD, rowid);
                                this.maxRowID = Math.max(this.maxRowID, rowid);
                                row = this.preRowNum;
                                if (row >= 0) {
                                    chgRow = this.insertRow(row, rowdata);
                                    this.preRowNum = chgRow + 1;
                                    rowdata.__nextrow = row;
                                } else {
                                    row = this.getDataPage().getRealRow(data.__rownum);
                                    chgRow = this.insertRow(row, rowdata);
                                    rowdata.__nextrow = -1;
                                }
                                this.setRowProperties(rowdata, data, map);
                                this.reflectData.rows.push(map);
                                addRows++;
                            }
                            break;
                    }
                });
            }
            this.isEdit = isEdit;
            if (page == 0 && addType == "refresh") {
                this.dataPage.refreshRows = this.getRowsCount();
            }
            if (vars) {
                fn.extend(vars, this.vars, true, true);
            }
        } catch (error) {
            throw error;
        }
        this.buildRowNum();
    };

    getDataPage = () => this.dataPage;

    getReflectData = (clear) => {
        let data = this.reflectData;
        if (clear) {
            this.reflectData = null;
        }
        return data;
    };

    /**
     * 插入一行,内部调用，没有触发任何状态改变和事件
     *
     * @param rownum
     * @param rowdata
     * @returns {Number}
     */
    insertRow = (rownum, rowdata) => {
        if (rownum >= 0) {
            for (let [index, row] of this.rows.entries()) {
                if (row.__rownum >= rownum) {
                    // 返回插入的下标
                    row.__rownum += 1;
                    this.rows.splice(index, 0, rowdata);
                    return index;
                }
            }
        }
        // 返回插入的下标
        this.rows.push(rowdata);
        return this.rows.length - 1;
    };

    /**
     * 定位要插入行的位置
     *
     * @param rownum
     */
    prepareInsertRow = (rownum) => {
        this.preRowNum = rownum;
    };


    /**
     * @deprecated #see prepareInsertRow
     * @param rownum
     */
    prepareInsert = (rownum) => {
        this.preRowNum = rownum;
    };

    getPrepareInsertRow = () => this.preRowNum;


    /**
     * 移动行数据
     *
     * @param from
     * @param to
     * @returns
     */
    moveRow = (from, to) => {
        let i = this.rows.move(from, to);
        if (i >= 0) {
            this.buildRowNum();
            return to;
        }
        return -1;
    };


    /**
     * 删除行数据
     *
     * @param row
     *            指定的行
     * @param stop
     *            是否停止触发事件
     * @param all
     *            是否包含过滤缓存区
     * @returns {Boolean}
     */
    delRow = (row, stop, all) => {
        let rowdata = null;
        if (row >= 0) {
            rowdata = this.rows.splice(row, 1)[0];
        }
        if (rowdata) {
            if (!stop) {
                // 触发delete事件
                if (this.editCols.length > 0) {
                    this.isEdit = true;
                }
            }
            return true;
        }
        return false;
    };


    /**
     * 在主数据区查找行
     *
     * @param method
     *            字符串或函数
     * @param from
     * @param to
     * @returns 查找到的行号
     */
    findRow = (method, from = 0, to) => {

        if (!to || to > this.rows.length) {
            to = this.rows.length;
        }
        let i = -1, f = false, p = [this];
        for (i = from; (i < to) && (!f); i++) {
            f = method.apply(this.rows[i], p);
            if (f) {
                break;
            }
        }
        // 返回to，或 -1
        return f ? i : -1;
    };


    /**
     * 为rowData创建顺序号和所在的行号 __rownum从0开始 __row从0开始
     */
    buildRowNum = () => {
        if (this.rows.length > 0) {
            let row = this.dataPage.getRowNum(0);
            for (let [index, row] of this.rows.entries()) {
                row.__rownum = index++;//__rownum是内部编号,不对外提供
                row.__row = index;
            }

        }
    };


    /**
     * 本方法只有在后台传来数据时,才会发生,不提供给外部调用，不涉及状态变动和事件触发
     *
     * @param rowdata
     *            指定的行数据对象
     * @param props
     * @returns
     */
    setRowProperties = (rowdata, props, map) => {
        map.__rowid = rowdata.__rowid;

        for (let key in props) {
            if (key.charAt(0) == 'c') {
                let col = key.substring(1) - 0; // 从1开始到后面所有字符
                if (rowdata.__data.rangeCheck(col)) {
                    // 已经转换成数值类型了
                    if (rowdata.__data[col] !== props[key]) {
                        rowdata.__data[col] = props[key];
                    }
                    map[this.columns[col].name] = props[key];
                }
            }
        }
        return null;
    };


    /**
     * 获取行属性
     * @deprecated by getValuesAt
     *
     * @param rown
     * @param colsname
     * @returns
     */
    getRowProperties = (row, colsname) => this.getValuesAt(row, colsname);


    /**
     * 在主数据缓存区获取行的状态
     *
     * @param row
     * @returns
     */
    getRowStatus = (row) => this.rows[row].__status;

    getRowRealStatus = (row) => this.rows[row].__status2;

    /**
     * 获取行数据,一般只用于内部调用
     *
     * @param rownum
     *            行号
     * @param all
     *            是否包括过滤缓存
     * @returns
     */
    getRowData = (rownum, all) => {
        let ds = this.rows, row = rownum;
        if (ds.rangeCheck(row)) {
            return ds[row];
        } else {
            throw `In ado ${this.name},getRowData rownum:${rownum} not exists !!!`;
        }
    };

    getRowsData = (fromrow, torow) => {
        let r = 0, rows = new Array(torow - fromrow);
        for (let i = fromrow; i < torow; i++) {
            rows[r++] = this.rows[i];
        }
        return r;
    };


    /**
     * 获取指定行的rowid
     *
     * @param row
     * @returns
     */
    getRowID = (row) => this.rows[row].__rowid;


    /**
     * 在主缓存区获取指定行指定列的值
     *
     * @param row
     * @param col
     * @returns
     */
    getValueAt = (row, col, ifnullvalue) => {
        if (this.rows.rangeCheck(row)) {
            let c1 = col;
            if (isNaN(col)) {
                c1 = this.getColumnIndex(col);
            }
            if (c1 == -100) {
                return this.rows[row]['$row'];
            } else if (c1 == -101) {
                return this.rows[row].__rowid;
            }
            if (!this.rows[row].__data.rangeCheck(c1)) {
                throw (`In getValueAt,column ${col} not exists !`);
            }
            let value = this.rows[row].__data[c1];
            return ((value == null || value == '') && ifnullvalue != undefined) ? ifnullvalue : value;
        } else {
            throw `In ado ${this.name},getRowData row:${row} not exists !!!`;
        }
    };


    /**
     * 修改主缓存数据指定行指定列的值
     *
     * @param row
     *            指定行
     * @param col_name_index
     *            列名或列号
     * @param value
     * @param stope
     *            是否禁止触发事件
     * @returns {Boolean}，有数据修改true,否则为false
     */
    setValueAt = (row, col_name_index, value, stope) => {
        let col = null;
        if (isNaN(col_name_index)) {
            col = this.getColumnIndex(col_name_index);
        } else {
            col = col_name_index - 0;
        }
        if (!this.rows.rangeCheck(row)) {
            throw new Error(`In AdoAgent:${this.name},setValueAt:row ${row} not exists !!!`);
        } else if (!this.columns.rangeCheck(col)) {
            throw new Error(`In AdoAgent:${this.name},setValueAt:column ${col_name_index} not exists !!!`);
        } else {
            let rd = this.rows[row];
            let cln = this.columns[col];
            let v1 = rd.__data[col];
            if (value) {
                value = parseValue(value, cln.dataType, cln.precision);
            }
            if (v1 !== value) {
                rd.__data[col] = value;

                // 行状态为修改
                rd.__status = ((rd.__status == ado_status.ROW_NOEDIT) ? ado_status.ROW_EDIT : rd.__status);
                if (rd.__cellStatus.indexOf(col) < 0) {
                    rd.__cellStatus.push(col);
                }
                this.isEdit = true;
                return true;
            }
            return false;
        }
    };


    /**
     * 在主数据缓存区获取一行的属性
     *
     * @param row_rowdata
     * @param colsname
     *            只能是用","分割的字符串或字符串数组
     * @returns
     */
    getValuesAt = (row_rowdata, colnames, hasvar) => {
        let rs = {};
        let rd = null;
        if (!isNaN(row_rowdata)) {
            if (this.rows.rangeCheck(row_rowdata)) {
                rd = this.rows[row_rowdata];
            } else {
                throw `In ado:${this.name},getValuesAt(row),row ${row_rowdata} over range !!!`;
            }
        } else {
            rd = row_rowdata;
        }
        if (rd) {
            if (colnames) {
                let ns = (colnames instanceof Array) ? colnames : colnames.toLowerCase().split(",");
                for (let item of ns) {
                    rs[item] = rd[item];
                }

            } else {
                rs.__rowid = rd.__rowid;
                rs.__rownum = rd.__rownum;
                rs.__status = rd.__status;
                rs.__status2 = rd.__status2;
                for (let [index, column] of this.columns.entries()) {
                    rs[column.name] = rd.__data[index];

                }

            }
        }
        // if (hasvar) {
        //     $extend(rs, this.vars);
        // }
        return rs;
    };


    /**
     * 修改主缓存区的数据值
     *
     * @param row
     *            指定行
     * @param props
     *            要修改的值集
     */
    setValuesAt = (row, props) => {
        if (props) {
            let col = -1;
            for (let i in props) {
                col = this.getColumnIndex(i);
                if (col >= 0) {
                    this.setValueAt(row, col, props[i], true);
                }
            }
        }
    };

    getVars = () => this.vars;

    removeVar = (name) => {
        let v1 = this.vars[name];
        delete this.vars[name];
        return v1;
    };

    setEdit = (edit) => {
        this.isEdit = edit;
    };

    /**
     * 统计主缓存区某列的值
     *
     * @param name_index
     * @param prec
     * @param func
     *            对指定行进行范围验证，确定是否包含在内
     * @returns
     */
    sum = (col_method, prec) => {
        let v = 0.0, v1 = null;
        if ((typeof col_method) == 'function') {
            let p = [this];
            for (let [index, row] of this.rows.entries()) {
                v1 = col_method.apply(row, p);
                v += ((v1 || 0) - 0);
            }

        } else {
            let col = isNaN(col_method) ? this.getColumnIndex(col_method) : col_method - 0;
            if (col >= 0) {
                for (let [index, row] of this.rows.entries()) {
                    v1 = row.__data[col];
                    v += ((v1 || 0) - 0);
                }
            }
        }
        return (prec || prec === 0) ? v.toFixed(prec) - 0 : v;
    };


    /**
     * 根据列名获取列号(列的位置)
     *
     * @param colname
     * @return
     */
    getColumnIndex = (colname) => {
        if (colname) {
            if (colname == "$row") {//从1开始的行号,__rownum从0开始
                return -100;
            } else if (colname == "__rowid") {//__rowid是虚拟的列
                return -101;
            } else {
                let i = this.colsIndex[colname.toLowerCase()];
                return (i === undefined || i === null) ? -1 : i;
            }
        }
        return -1;
    };

    getColumnName = (index) => this.columns.rangeCheck(index) ? this.columns[index].name : null;


    /**
     * 获取指定的列
     *
     * @param col_name
     *            列名或列号
     * @returns
     */
    getColumn = (col_name) => {
        let i = isNaN(col_name) ? this.getColumnIndex(col_name) : col_name;
        return this.columns.rangeCheck(i) ? this.columns[i] : null;
    };

    /**
     * 获取列数
     *
     * @returns
     */
    getColumnCount = () => this.columns.length;


    /**
     * 以数组形式返回多个列名的位置
     *
     * @param colsname
     * @returns
     */
    getColumnsIndex = (colsname) => {
        let ci = [];
        if (colsname) {
            if (colsname == '#all') {
                for (let [index, colIndex] of this.colsIndex.entries()) {
                    ci[index] = index;
                }

            } else {
                let cs = colsname;
                if (typeof (colsname) == 'string') {
                    cs = colsname.split(",");
                }

                for (let [index, item] of cs.entries()) {
                    ci[index] = this.getColumnIndex(item);
                }
            }
        }
        return ci;
    }


    /**
     * 根据指定的状态获取默认的行数据，内部调用
     *
     * @param status
     *            行的状态
     * @param rowid
     *            指定的rowid
     * @returns {RowData}
     */
    createDefaultRowData = (status, rowid) => {
        let len = this.columns.length;
        let rd = new RowData(len, status, rowid, this.colsIndex);
        for (let i = 0; i < len; i++) {
            // 获取默认值
            rd.__data[i] = this.columns[i].defa;
        }
        return rd;
    };

    /**
     * 根据rowid获取所在的行
     *
     * @param id
     * @param all
     *            是否包括过滤缓存
     * @return
     */
    findRowByRowID = (rowid) => {
        let count = this.rows.length;
        for (let i = 0; i < count; i++) {
            if (this.rows[i].__rowid == rowid) {
                return i;
            }
        }
        return -1;
    };


    /**
     * 获取rowid所在的行的集合
     * @param rowid
     * @returns {{}}
     */
    getRowIDMap = (rowid) => {
        let map = new Map();
        let count = this.rows.length;
        for (let i = 0; i < count; i++) {
            map.set(this.rows[i].__rowid, i);
        }
        return map;
    };


    /**
     * 清空所有数据和行状态
     */
    reset = () => {
        this.rows.length = 0;
        this.isEdit = false;
    };


    /**
     * 清空修改状态
     *
     * @param status
     *            修改为指定的状态
     */
    clearEdit = (status) => {
        let rowdata = null;
        let st1 = ado_status.ROW_NOEDIT;
        let data = this.rows;
        for (let i = 0; i < data.length; i++) {
            rowdata = data[i];
            if (status == st1) {
                rowdata.__status = rowdata.__status2 = st1;
            }

            rowdata.__cellStatus.length = 0;
        }
        this.isEdit = (status != st1);
    };

    /**
     * 判断是否存在已修改还没有同步的数据
     *
     * @return {Boolean}
     */
    hasEditData = () => {
        if (this.editCols.length > 0) {
            let d1 = this.rows;
            for (let i = 0; i < d1.length; i++) {
                if (d1[i].__status != ado_status.ROW_NOEDIT) {
                    return true;
                }
            }
        }
        return false;
    };


    /**
     * 判断是否修改或未保存
     */
    isDataEdit = () => this.isEdit || this.hasEditData();

    /**
     * 获取修改的数据
     *
     * @return {}
     */
    getUpdateData = () => {
        let prop = null;
        if (this.editCols.length > 0) {
            prop = {
                convert: "1"
            };
            // 修改状态值为sync，
            this.forActiveCell(this, prop);

            let eData = [];
            // 主缓存区和过滤缓存区
            let data = this.rows;
            for (let i = 0; i < data.length; i++) {
                let rd = data[i];

                if ((rd.__status != ado_status.ROW_NOEDIT) && (rd.__cellStatus.length > 0)) {
                    let p = {
                        __rowid: rd.__rowid,
                        __status: rd.__status
                    };

                    let vs = rd.__cellStatus;
                    for (let j = 0; j < vs.length; j++) {
                        let col = vs[j];
                        let value = rd.__data[col];
                        if (value && value instanceof Date) {
                            value = value.getTime();
                        }
                        p["c" + col] = value;
                    }
                    eData.push(p);
                }
            }
            if (eData.length > 0) {
                prop.data = eData;
            } else {
                prop = null;
            }
        }
        return prop;
    };


    /**
     * 返回主缓存区数据行数
     *
     * @returns
     */
    getRowsCount = () => this.rows.length;


    /**
     * 按指定的了排序,可对多列排序
     *
     * @param cols_and_type[[]]
     *            二维数组 排序列序号或列名及排序方式，如[[a,1],[b,-1]]按列顺序,b列倒叙
     * @param type[]
     *            排序方式 1/顺序 -1/倒序
     * @returns
     */
    sortBy = (cols_and_type) => {
        let ct = cols_and_type;
        if (typeof ct == 'string') {
            ct = ct.split(";");

            for (let i = 0; i < ct.length; i++) {
                let p = ct[i].indexOf(",");
                if (p >= 0) {
                    ct[i] = [ct[i].substring(0, p), parseInt(ct[i].substring(p + 1))];
                } else {
                    ct[i] = [ct[i], 1];
                }
            }
        }
        if (ct && ct.length > 0) {
            for (let i = 0; i < ct.length; i++) {
                ct[i][0] = isNaN(ct[i][0]) ? this.getColumnIndex(ct[i][0]) : (ct[i][0] - 0);
            }
            this.rows.sort((x, y) => {
                let vx, vy;
                for (let i = 0; i < ct.length; i++) {
                    vx = x.__data[ct[i][0]] || '';
                    vy = y.__data[ct[i][0]] || '';
                    if (vx != vy) {
                        return (vx > vy) ? ct[i][1] : -ct[i][1];
                    }
                }
                return 0;
            });
            this.buildRowNum();
        }
    }


    /**
     * 对指定的列进行排序
     *
     * @param cname
     *            列名
     * @param type
     *            顺序或倒序(1/顺序;-1/倒序)
     */
    sort = (cname, type) => {
        this.sortBy([[cname, type || 1]]);
    };

    toPage = (page) => {
        if (page < 0) {
            page = 0;
        } else if (page >= this.dataPage.pages) {
            page = this.dataPage.pages - 1;
        }
        let options = {};
        if (page != this.dataPage.currentPage) {
            options.params = {_name: this.getName(), page: page};
            return new Promise((resolve, reject) => {
                this.context.request(this.getActiveModuleName(), "pagedata", '', null, null, options, resolve, reject);  // , null, null, options
            });
        }
        return Promise.resolve({});
    };

    hasNextPage = () => {
        let pg = this.getDataPage();
        return pg.hasNextPage();
    };

    nextPage = () => {
        let pg = this.getDataPage();
        let page = pg.getCurrentPage();
        if (pg.getPageCount() > 0 && (page < pg.getPageCount() - 1)) {
            let options = {};
            //if (page != this.dataPage.currentPage) {
            options.params = {_name: this.getName(), page: page + 1};
            return new Promise((resolve, reject) => {
                this.context.request(this.getActiveModuleName(), "pagedata", '', null, null, options, resolve, reject);
            });
            //}
        }
        return Promise.resolve({});
    };

    release = () => {
        this.reset(true);
        if (this.context) {
            this.dataPage.release();
            this.context = null;
            this.dataPage = null;
        }
    };

    toString = () => this.name;
}

class Engine {
    _inited = false;
    _amgn = null;
    _checkid = null;
    _lifeType = 'keep';
    envs = {};
    ams = {};
    fn = fn;
    vue = null;

    constructor(vue) {
        this.vue = vue;
        if (vue && vue.$data['adapter']) {
            let adapter = vue['adapter'];
            let am = null;
            for (let amn in adapter) {
                am = new ActiveModule(amn, this);
                if (adapter[amn]['group']) {
                    this._amgn = amn;
                }
                //映射数据对象数据
                let ados = adapter[amn]['ados'];
                if (ados) {
                    let a1 = null;
                    for (let name in ados) {
                        a1 = ados[name];
                        am.mappingData(name, a1['rows'], a1['vars'] || '', a1['options']);
                    }
                }
                //缓存amn
                this.ams[amn] = am;
            }
        }
    }

    //初始化，外部驱动
    init = (amgn, amn, checkid, options = {}) => {
        this._amgn = amgn || this._amgn;
        amn = amn || this._amgn;

        if (checkid) {
            this._checkid = checkid;
        }
        let act = options['_act'];
        if (!this._inited || (!this._checkid) || (checkid != this._checkid)) {
            return new Promise((resolve, reject) => {
                this.request(amn, "reg_am", act, null, null, options, resolve, reject);  // , null, null, options
            });
        } else if (act) {
            return new Promise((resolve, reject) => {
                this.request(amn, "call", act, null, null, options, resolve, reject);  // , null, null, options
            });
        }
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
     * @param type call/async
     * @param action 动作名
     * @param options
     * @param norand 不生成随机码
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
                url._rand = this.randNum();
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

    // 产生随机数,ok
    randNum = () => {
        let today = new Date();
        return Math.abs(Math.sin(today.getTime()));
    }
    //type, name, ados, jsondata, options
    call = (amn, name, ados, jsondata, options) => {
        //return this.request(amn, "call", name, ados, jsondata, options);
        return new Promise((resolve, reject) => {
            this.request(amn, "call", name, ados, jsondata, options, resolve, reject);  // , null, null, options
        });
    }

    selfCall = (amn, name, ados, jsondata, options) => {
        return new Promise((resolve, reject) => {
            this.request(amn, "async", name, ados, jsondata, options, resolve, reject);  // , null, null, options
        });
        //return this.request(amn, "async", name, ados, jsondata, options);
    }

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
            //var onLoadScript = cells['onLoad'];
            var cbps = cells["cbps"];//回调函数的参数
            if (envs && !fn.isEmptyObject(envs)) {
                if (envs["_checkid"]) {
                    this._checkid = envs["_checkid"];
                    delete envs["_checkid"];
                }
                if (!fn.isEmptyObject(envs)) {
                    //this.setEnvs(envs, true);
                    this.transParent({
                        type: 'env',
                        isParent: false,
                        data: envs,
                        _amgn: this._amgn
                    });
                }
            }

            var ados = cells['ados'];
            var prop;//, mkados = [];
            if (ados && ados.length > 0) {
                // 数据对象定义
                for (let i = 0; i < ados.length; i++) {
                    // 创建db
                    prop = ados[i];
                    if (prop) {
                        name = prop.name;
                        amn = prop._amn;
                        if (!this.getADO(name, amn)) {
                            // 没有建立ycdb
                            ado = new ADOAgent(name, this);
                            ado.init(prop);
                            this.getActiveModule(amn, true).addADO(ado);
                            //mkados.push(ado);
                        }
                    }
                }
            }
            var ds = '', am = null;
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
                            });
                        }
                    }
                }
            }
            if (ds) {
                // let adapter = null;
                for (let i = 0; i < ds.length; i++) {
                    am = this.getActiveModule(ds[i].getActiveModuleName());
                    if (am) {
                        am.outData(ds[i], true);
                    }
                }
            }
            if (envs && !fn.isEmptyObject(envs)) {
                fn.extend(envs, this.envs, true, true);
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
                                //transParent
                            // }
                        }
                    }
                }
            }
        }
    }


    /**
     * type: 'ado',
     *  isParent: false,
     *  data: data[i],
     *  name: name,
     *   _amn: amn,
     *  _amgn: this._amgn
     */
    transParent = (options) => {
        if (this.vue) {
            let parent = this.vue.$parent;
            let ok = false;
            if (parent) {
                options.isParent = true;


                if (!ok && parent.$parent && parent.$e) {

                }
            }
        }
    }

    request2 = (amn, type, name, adosname, jsondata, options, resolve, reject) => {
        // 获取需要同步的数据对象action, param, data
        amn = (amn || this._amgn);
        let data = this.buildData(amn, adosname, jsondata);
        // 执行服务器端调用,主动分析返回的数据,做相关的处理,顺序是先处理同步数据,再显示同步消息
        // 如1.数据保存后,返回的同步信息
        // 2.在刷新数据对象时,更新本地缓存的数据
        // 3.其他方式下,执行服务器端调用后,同步返回的信息
        let settings = {
            _baseURI: this._baseURI + "cloud?",
            _amgn: this._amgn,
            _amn: amn || this._amgn,
            _name: name,
            _type: type,
            _hasdata: (data ? "1" : "0"),
            _checkid: this._checkid
        };
        options = options || {};
        if (options.async == undefined) {
            options.async = true;// (type == 'call') ? false : true;
        }
        if (options.params) {
            fn.extend(options.params, settings, true);
        }
        options.error = options['error'] || this.defa_error;
        // return new Promise((resolve, reject) => {
        this.ajax(settings, data, options, resolve, reject);  // , null, null, options
        // })
    };

    request = (amn, type, name, adosname, jsondata, options, resolve, reject) => {
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
        // options = options || {};
        // if (options.async == undefined) {
        //     options.async = true;// (type == 'call') ? false : true;
        // }
        if (options.params) {
            fn.extend(options.params, settings, true);
            delete options.params;
        }
        // options.error = options['error'] || this.defa_error;

        this.ajax(settings, data, options, resolve, reject);
    }


    //处理默认的系统消息
    defaultError = (err) => {
        if (err.code == 101) {
            // fn.showModal('信息提示', err.message || err.msg);
        } else if (err.code == 111) {
            this.exitSystem();
        } else {
            // fn.showModal('信息提示', '错误代码：' + err.code + "," + (err.message || err.msg));
        }
    }
    //退出系统，重新登录
    exitSystem = () => {
        // this.showModal('系统提示', '网络连接超时，请您重新登录', {
        //     method: function () {
        //         //退出app
        //         //#ifdef APP-PLUS
        //         if (plus.os.name.toLowerCase() === 'android') {
        //             plus.runtime.quit();
        //         } else {
        //             const threadClass = plus.ios.importClass("NSThread");
        //             const mainThread = plus.ios.invoke(threadClass, "mainThread");
        //             plus.ios.invoke(mainThread, "exit");
        //         }
        //         //#endif
        //     }
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
     * @param resolve
     * @param reject
     */
    ajax = (ajaxUrl, postData, options, resolve, reject) => {

        console.log('----------------ajax---------' + JSON.stringify(options));


        if (this.delayed) {
            clearTimeout(this.delayed);
            this.delayed = null;
        }
        let settings = {
            url: this.serialURL(ajaxUrl),
            method: 'POST',
            data: postData
        };

        console.log('---------------tt----------------' + JSON.stringify(settings))

        let self = false;
        if (options) {
            let setting = options['setting'] || {};
            this.fn.extend(setting, settings, true);
            if (options['parseSelf']) {
                self = true;
            }
        }
        $axios(settings).then((res) => {
            if (res.status === 200) {
                try {
                    if (self) {
                        //自己解析数据
                        resolve(res.data);
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
                            //提示性信息按异常处理
                            throw {code: 101, message: (res.data['message'] || res.data['msg'])};
                        } else {
                            //返回的参数
                            resolve(res.data['cbps'] || {});
                        }
                    }
                } catch (err) {
                    reject(err);
                }
            } else {
                //其实，res.status ！== 200，并不一定是错误的，对于后端请求重定向的status,就不是 200
                reject(this.parseError(res));
            }
        }).catch((res) => {
            reject(this.parseError(res));
        }).finally((res) => {
            if (this.delayed) {
                clearTimeout(this.delayed)
                this.delayed = null;
            }
        })
    };


    getMV = () => this.vue;

}

// class Adapter {
//     vue = null;
//     amn = null;
//
//     constructor(vue, amn) {
//         this.vue = vue;
//         this.amn = amn;
//     }
//
//     /**
//      * @param adoname
//      * @param rows1 vue中的，仅指定名称即可
//      * @param vars1  vue中的，仅指定名称即可
//      * @param options 存放回写的字段{writeback:['colname1','colname2']},如为空，表示会写所有字段
//      */
//     mappingData(adoname, rows1, vars1, options) {
//         this[adoname] = {rows: rows1, vars: vars1, options: options};
//     };
//
//     changeViewProperty(options){
//         let text=null,value;
//         for (let k in options){
//             if (k.startsWith("/")){
//                 text=options[k]['listData'];
//                 //要判断text是否为plainObject
//                 value={};
//                 if (text) {
//                     value=this.parseListData(text);
//                 }
//                 this.vue['viewData'][k.substring(1).toLowerCase()]=value;
//             }
//         }
//     };
//     parseListData(text,p1,p2){
//         let data = {};
//         if (text) {
//             if ( typeof(text)=='string') {
//                 let vs = text.split(p1 || ";");
//                 p2 = p2 || "/";
//                 for (let i = 0; i < vs.length; i++) {
//                     let j = vs[i].indexOf(p2);
//                     if (j >= 0) {
//                         data[vs[i].substring(0, j)] = vs[i].substring(j + 1);
//                     } else {
//                         data[vs[i]] = vs[i];
//                     }
//                 }
//             }else{
//                 data=text;
//             }
//         }
//         return data;
//     };
//
//
//     /**
//      * 返回vue中使用的vars
//      * @param adoname
//      */
//     getVars(name) {
//         return this.vue.$data[this[name]['vars']];
//     }
//
//     release() {
//         this.vue = null;
//         this.ados = null;
//         this.adoname = null;
//     }
// }

class ActiveModule {
    _amn = '';
    context = null;//engine
    ados = null;
    mapping = null;
    view=null;

    constructor(amn, context) {
        this._amn = amn;
        this.ados = {};
        this.context = context;
        this.mapping = {};
        this.view={};//视图名到数据对象的映射
    }

    /**
     *
     * @param name 数据对象名
     * @param rows 数据行名
     * @param vars 数据对象变量名
     */
    mappingData(name, rows, vars,options) {
        name=fn.convertName(name);
        this.mapping[name] = {rows: rows, vars: vars || ''};
        if (options && options['view']){
            this.view[fn.convertName(options['view'])]=name;
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
        let name=this.view[viewname];
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
            }else{
                throw "ado "+name +" not in adapter !!!";
            }


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
        if (this.mapping[name]['options']) {
            cols = this.mapping[name]['options']['writeback'];
        }
        if (cols !== 'none') {
            let row, idRows = ado.getRowIDMap();
            let rows0 = this.vue.$data[this.mapping[name]['rows']];
            for (let i = 0; i < rows0.length; i++) {
                row = idRows(rows0[i].__rowid);
                if (!cols) {
                    for (let j = 0; j < cols.length; j++) {
                        ado.setValueAt(row, cols[j], rows0[i][cols[j]]);
                    }
                } else {
                    ado.setValuesAt(row, rows0[i]);
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

export default Engine;

// let $e = new Engine();

// export const pageCall = $e.pageCall;
