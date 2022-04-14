<template>
  
    <div>

        <h1>Hello</h1>
        <button @click="sendMsg">传参</button>

    </div>

</template>

<script>
export default {

    onLoad(){
        const eventChannel = this.getOpenerEventChannel();
        // 监听acceptDataFromOpenerPage事件，获取上一页面通过eventChannel传送到当前页面的数据
        eventChannel.on('acceptDataFromIndex', function(data) {
            alert(data.data);
        })
    },

    methods : {
        sendMsg(){
            const eventChannel = this.getOpenerEventChannel();
            eventChannel.emit('acceptDataFromUser', {data: 'data from test page'});
            eventChannel.emit('someEvent', {data: 'data from test page for someEvent'});
        
        }
    }
    

}
</script>

<style>

</style>