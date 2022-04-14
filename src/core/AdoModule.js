import {fn} from './Utils.js';
const {getBoolean, parseValue} = fn;


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
        this.pageLoadReset = getBoolean(pageLoadReset, true);
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
    getValuesAt = (row_rowdata, colnames, withstatus) => {
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
            if (withstatus) {
                rs.__rowid = rd.__rowid;
                rs.__rownum = rd.__rownum;
                rs.__status = rd.__status;
                //rs.__status2 = rd.__status2;
            }
            if (colnames) {
                let ns = (colnames instanceof Array) ? colnames : colnames.toLowerCase().split(",");
                let cs = this.getColumnsIndex(ns);
                let c = 0;
                for (let item of ns) {
                    rs[item] = rd.__data[cs[c++]];
                }
            } else {
                for (let [index, column] of this.columns.entries()) {
                    rs[column.name] = rd.__data[index];
                }

            }
        }
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

    toPage = async (page) => {
        if (page < 0) {
            page = 0;
        } else if (page >= this.dataPage.pages) {
            page = this.dataPage.pages - 1;
        }
        let options = {};
        if (page != this.dataPage.currentPage) {
            options.params = {_name: this.getName(), page: page};
            await this.context.request(this.getActiveModuleName(), "pagedata", '', null, null, options);
            return true;
        }
        return false;
    };

    hasNextPage = () => {
        let pg = this.getDataPage();
        return pg.hasNextPage();
    };

    nextPage = async () => {
        let pg = this.getDataPage();
        let page = pg.getCurrentPage();
        if (pg.getPageCount() > 0 && (page < pg.getPageCount() - 1)) {
            let options = {};
            //if (page != this.dataPage.currentPage) {
            options.params = {_name: this.getName(), page: page + 1};
            await this.context.request(this.getActiveModuleName(), "pagedata", '', null, null, options);
            return true;
            //}
        }
        return false;
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



export default ADOAgent;














