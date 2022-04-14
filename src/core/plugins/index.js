import {showLoading, hideLoading} from './uni-components/DefaultLoading/index.js';

let install = (Vue) => {
    Vue.prototype.$showLoading = showLoading;
    Vue.prototype.$hideLoading = hideLoading;
};


export {showLoading, hideLoading};

export {openWindow, getEventChannel, navigateTo, redirectTo, reLaunch, switchTab, navigateBack, preloadPage} from './uni-components/Redirect/index.js';

export default install

