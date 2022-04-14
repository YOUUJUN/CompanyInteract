
export const openWindow = function(url, params={}, name='navigateTo'){
    console.log('url', url);
    var _this = this;

    params = Object.assign({}, {
        url
    },params);

    console.log('params1', params );
    switch (name) {
        case "navigateTo":
            params = Object.assign({}, {
                events : {}
            },params);

            params.events = Object.assign({}, {
                _callback: function(payload) {
                    _this.transParent(payload,false);
                }
            },params.events);

            console.log('params', params );
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


export const getEventChannel = function(){
    console.log('this', this);
    return (this['$scope'] && this['$scope'].eventChannel)? this.$scope.eventChannel:this.getOpenerEventChannel();
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

