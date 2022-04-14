import Vue from 'vue'
import App from './App'

import store from './store/index';

//uview-ui
import uView from 'uview-ui';
Vue.use(uView);

//平台交互
import Engine from './core/Engine.js'
Vue.prototype.$Engine = Engine;

//全局组件
import  customComponents from './core/plugins/index.js';
Vue.use(customComponents);


Vue.config.productionTip = false

App.mpType = 'app'
const app = new Vue({
  store,
  ...App
})
app.$mount()
