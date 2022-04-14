<template>

	<view>

		<header>


		</header>

		<main>


			<input type="text">

			<button @click="Loading()">加载</button>

			<button @click="test()">post</button>

			<button @click="goto()">跳转</button>

		</main>

		<footer>


		</footer>

	</view>

</template>

<script>

	const adapter = {

		wx_car_show_desk:{
			ados:{
				data_list:{rows:'carList',vars: 'carVars'}
			},
			group:true,
		},

		phone_brands_list : {
			ados:{
				data_list:{rows:'brandsList',vars: 'brandVars'}
			},
		}
	};

	export default {
		data() {
			return {

				brandsList : [],

				carList : [],

				carVars : {

				},

				brandVars : {

				},


			};
		},


		created(){

			this.$e = new this.$Engine(this, adapter);

			this.$e.init(null, 'wx_car_show_desk' , null, {

			}).then(res => {

				console.log('this ==>',this);
				console.log('res ==>',res);
				console.log('brandsList ==>',this.brandsList);
			}).catch(err => {
				console.log('err--from init', err);
			});


			this.$once('hook:beforeDestroy', () => {
				this.$e.release();
			})


		},

		mounted(){
			this.search();
		},



		beforeDestroy(){

		},

		methods: {

			search(){
				let vm = this;

				let payLoad = {

				};

				this.$e.call('wx_car_show_desk', 'filter.Refresh', null, payLoad, {
					params: {

					}
				}).then(res => {
					console.log('res',res);
					console.log('---------->list',vm.carList);

				}).catch(err => {
					console.log('err',err);
				})

			},


			Loading(){

				this.$e.fn.navigateTo();

				this.$e.fn.showLoading();
				setTimeout(() => {
					this.$e.fn.hideLoading();
				},3000);

				// uni.redirectTo({
				// 	url : "/pages/details/details",
				// 	success (){
				// 		console.log('ok');
				// 	}
				// })

			},


			test(){
				this.$e.call('phone_brands_list', 'GetSerial', null, {
					user:'youjun',
					year : 2015
				}, {
					params: {
						car_brands: '大众',
					}
				}).then(res => {
					console.log('res', res);
				}).finally(() => {

				});
			},

			goto(){
				uni.navigateTo({
					url : '/pages/User/User',
					events : {
						acceptDataFromUser: function(data) {
							console.log(data);
						},
						someEvent: function(data) {
							console.log(data)
						}
					},
					success (res){
						console.log('res', res);
						res.eventChannel.emit('acceptDataFromIndex', 
							{data : 'data from index page'}
						)
					}
				})
			}


		}
	};
</script>


<style scoped>

</style>
