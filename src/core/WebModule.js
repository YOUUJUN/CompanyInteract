import fly from 'flyio';

import {showLoading, hideLoading} from './plugins/index.js';

fly.config.withCredentials = false;
fly.config.baseURL = "http://erp.yuchengchina.com:15280/";
fly.config.timeout = 120000;
fly.config.responseType = 'json';
fly.config.responseEncoding = 'utf8';

//添加请求拦截器
fly.interceptors.request.use((request)=>{
    showLoading();
    //给所有请求添加自定义header
    request.headers["X-Tag"]="flyio";
    //打印出请求体
    console.log(request.body);
    //终止请求
    //var err=new Error("xxx")
    //err.request=request
    //return Promise.reject(new Error(""))

    //可以显式返回request, 也可以不返回，没有返回值时拦截器中默认返回request
    return request;
})

//添加响应拦截器，响应拦截器会在then/catch处理之前执行
fly.interceptors.response.use(
    (response) => {
        hideLoading();
        return response;
    },
    (err) => {
        hideLoading();
        //发生网络错误后会走到这里
        //return Promise.resolve("ssss")
    }
);

export default fly;



















