let events={
	callback: function(payload) {
	     this.$e.transParent(payload,false);
	}
}

/**
 * 在onLoad中，获取上个窗口的handle
 */
onLoad=function(){
	this.$e.parentChannel= (this['$scope'] && this['$scope'].eventChannel)? this.$scope.eventChannel:this.getOpenerEventChannel();
}

export const openWindow = (url, params={}, name='navigateTo') => {
    params = Object.assign({}, {
        url
    },params);
    switch (name) {
        case "navigateTo":
            uni.navigateTo(params);
            break;
        case "redirectTo":
            uni.redirectTo(params);
            break;
        case "reLaunch":
            uni.reLaunch(params);
            break;
        case "switchTab":
            uni.switchTab(params);
            break;
        case "navigateBack":
            uni.navigateBack(params);
            break;
        case "preloadPage":
            uni.preloadPage(params);
            break;
    }
};

export const navigateTo = (params = {}) => {
    uni.navigateTo(params);
}

export const redirectTo = (params = {}) => {
    uni.redirectTo(params);
}

export const reLaunch = (params = {}) => {
    uni.reLaunch(params);
}

export const switchTab = (params = {}) => {
    uni.switchTab(params);
}

export const navigateBack = (params = {}) => {
    uni.navigateBack(params);
}

export const preloadPage = (params = {}) => {
    uni.preloadPage(params);
}

