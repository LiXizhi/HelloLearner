(function () {
  const unitNames = {
    'U1':'初次连接','U2':'身边事物','U3':'正在发生','U4':'日常生活','U5':'健康与周末',
    'U6':'出行与购物','U7':'经历与计划','U8':'清晰表达','U9':'进阶沟通'
  };
  const icons = ['●','◆','✦','▲','■','◎'];
  const rows = [
    ['greeting-politely','01','Pre-A1','U1','礼貌打招呼','Greet someone politely','Excuse me. Is this seat free?','打扰一下，这个座位有人吗？','excuse,seat,free,sorry,please,thanks','1-4','陌生同学','礼貌开启一次交流'],
    ['introductions','02','Pre-A1','U1','自我介绍','Introduce yourself',"Hi, I'm Sequoia. Nice to meet you.",'你好，我是 Sequoia，很高兴认识你。','name,my,your,meet,nice,too','5-6','新同学','介绍自己并回应问候'],
    ['identity-check','03','Pre-A1','U1','确认身份','Ask about identity','Are you a new student?','你是新同学吗？','student,teacher,new,yes,no,class','7-8','班级助教','确认对方的身份'],
    ['how-are-you','04','Pre-A1','U1','询问近况','Ask how someone feels','How are you today?','你今天怎么样？','fine,well,tired,happy,today,thank','9-10','朋友','询问近况并自然回应'],
    ['nationality','05','A1','U1','来自哪里','Talk about countries','Where are you from?','你来自哪里？','from,country,city,Chinese,Korean,French','15-16','国际活动志愿者','说明自己来自哪里'],
    ['jobs','06','A1','U1','谈论职业','Talk about jobs','What do you do?','你是做什么工作的？','job,designer,teacher,doctor,student,work','17-18','活动认识的新朋友','询问并介绍职业'],

    ['possessions','07','A1','U2','物品归属','Ask who owns something','Is this your bag?','这是你的包吗？','this,that,bag,your,mine,whose','11-12','失物招领员','确认物品属于谁'],
    ['colours','08','A1','U2','颜色与款式','Describe colour and style','What colour is your jacket?','你的夹克是什么颜色？','colour,black,white,blue,jacket,dress','13-14','服装店店员','描述一件物品的颜色'],
    ['choose-one','09','A1','U2','选择物品','Choose the right item','Which one would you like?','你想要哪一个？','which,one,these,those,glass,book','21-24','商店店员','在多个物品中做出选择'],
    ['home-objects','10','A1','U2','家里的物品','Name household objects','The cups are in the cupboard.','杯子在橱柜里。','kitchen,cup,cupboard,table,shelf,room','25-28','来访的朋友','介绍家中物品的位置'],
    ['where-is-it','11','A1','U2','询问位置','Ask where things are','Where are my keys?','我的钥匙在哪里？','where,key,on,in,under,beside','26-28','室友','找到一件遗失物品'],
    ['simple-instructions','12','A1','U2','简单指令','Give simple instructions','Please put it on the table.','请把它放在桌上。','put,give,open,close,table,please','20-30','一起整理房间的朋友','听懂并完成简单指令'],

    ['actions-now','13','A1','U3','此刻在做什么','Describe actions now',"What are you doing?",'你正在做什么？','doing,reading,working,cooking,watching,now','31-34','朋友','描述此刻正在进行的活动'],
    ['small-talk','14','A1','U3','轻松寒暄','Connect weather and actions','The sun is shining, so we are walking.','阳光很好，所以我们正在散步。','sun,cloud,shine,walk,river,sky','33-34','散步伙伴','描述天气和当前活动'],
    ['places-around','15','A1','U3','社区与地点','Describe places nearby','There is a café near my home.','我家附近有一家咖啡馆。','village,street,near,bridge,shop,cafe','35-36','新邻居','介绍居住地附近的设施'],
    ['future-intention','16','A1','U3','准备做什么','Talk about intentions',"I'm going to make dinner.",'我准备做晚饭。','going,make,paint,wait,dinner,tonight','37-40','室友','说明接下来的计划'],
    ['there-is','17','A1','U3','有没有','Ask whether something exists','Is there any coffee left?','还有咖啡吗？','there,any,some,left,bottle,bread','41-44','家人','确认家里还有什么'],
    ['can-you','18','A1','U3','请求帮助','Ask for help with can','Can you help me with this box?','你能帮我搬这个箱子吗？','can,help,carry,box,heavy,sure','45-46','同事','礼貌请求并回应帮助'],

    ['coffee','19','A1','U4','咖啡店点单','Order a drink','Could I have a medium latte, please?','请给我一杯中杯拿铁。','coffee,milk,sugar,cup,please,black','47-48','咖啡师','完成饮品与附加要求'],
    ['food-preferences','20','A1','U4','饮食偏好','Say what you like','I like chicken, but I do not like beef.','我喜欢鸡肉，但不喜欢牛肉。','like,want,chicken,beef,vegetable,fruit','49-50','一起吃饭的朋友','表达喜欢和不喜欢的食物'],
    ['climate','21','A1','U4','天气与气候','Describe local climate','It is often warm and sunny here.','这里经常温暖晴朗。','climate,warm,cold,rain,sunny,often','51-54','外地朋友','介绍本地气候'],
    ['daily-routine','22','A1','U4','日常作息','Describe a routine','I usually start work at nine.','我通常九点开始工作。','usually,start,finish,morning,evening,work','55-56','新同事','描述一天的日常安排'],
    ['unusual-day','23','A1','U4','不一样的一天','Contrast routine and now','I usually drive, but today I am walking.','我通常开车，但今天在步行。','usually,today,drive,walk,different,because','57-58','同事','说明今天和平时有什么不同'],
    ['time-plans','24','A1','U4','时间与安排','Ask and tell the time','What time shall we meet?','我们几点见面？','time,clock,half,quarter,meet,late','58-60','约见的朋友','确认见面时间'],

    ['at-the-doctor','25','A1','U5','身体不舒服','Explain a health problem','I have a bad cold and a headache.','我重感冒了，还有点头疼。','cold,headache,temperature,doctor,better,rest','61-63','医生','说明症状并听懂建议'],
    ['health-advice','26','A1','U5','健康建议','Give simple advice','You should rest and drink some water.','你应该休息并喝些水。','should,must,rest,water,medicine,bed','62-64','健康顾问','理解必须做和不能做的事'],
    ['permission-time','27','A1','U5','时间与许可','Ask for permission','Can I stay out until ten?','我可以在外面待到十点吗？','until,home,early,late,permission,parent','65-66','寄宿家庭家长','询问回家时间并达成约定'],
    ['weekend-plans','28','A1','U5','周末计划','Talk about the weekend','What are you going to do this weekend?','你这个周末准备做什么？','weekend,Saturday,Sunday,visit,stay,plan','67-68','朋友','交流周末计划'],
    ['past-location','29','A1+','U5','过去在哪里','Talk about past location','Where were you yesterday afternoon?','昨天下午你在哪里？','was,were,yesterday,race,crowd,there','69-70','活动组织者','说明过去的地点'],
    ['past-time','30','A1+','U5','过去的时间','Ask when something happened','When did you arrive?','你什么时候到的？','when,arrive,leave,last,ago,did','71-72','接待人员','说明过去事件的时间'],

    ['directions','31','A2','U6','问路与指路','Ask for directions','Could you tell me the way to the station?','你能告诉我去车站的路吗？','way,station,turn,straight,left,right','73-74','当地居民','问清去车站的路线'],
    ['shopping','32','A2','U6','商店购物','Ask about size and stock','Do you have these in a smaller size?','这件有小一点的尺码吗？','size,pair,colour,stock,smaller,fit','75-80','服装店店员','找到合适的尺寸和颜色'],
    ['restaurant','33','A2','U6','餐厅用餐','Order a meal',"I'd like the roast chicken, please.",'我想要烤鸡，谢谢。','menu,order,chicken,potato,drink,bill','81-82','餐厅服务员','完成主食和饮品点单'],
    ['holiday-prep','34','A2','U6','准备旅行','Prepare for a holiday',"We're packing because we leave tomorrow.",'我们明天出发，所以正在收拾行李。','holiday,pack,suitcase,leave,tomorrow,trip','83-84','旅行伙伴','说明旅行准备和出发时间'],
    ['past-trip','35','A2','U6','聊一次旅行','Tell a past travel story','I went to Paris last spring.','去年春天我去了巴黎。','went,stayed,visited,spring,hotel,journey','85-86','旅行中认识的朋友','简短讲述一次过去的旅行'],
    ['transport-tickets','36','A2','U6','车站购票','Buy a ticket','Two return tickets to London, please.','请给我两张去伦敦的往返票。','ticket,return,platform,train,leave,miss','95-96','车站售票员','购票并确认站台和发车时间'],

    ['recent-actions','37','A2','U7','最近做过什么','Talk about recent actions','What have you done today?','你今天都做了什么？','have,done,already,yet,just,today','85-88','朋友','交流今天已经完成的事情'],
    ['accident-report','38','A2','U7','描述意外','Report an accident','A car has hit the gate.','一辆车撞到了大门。','accident,hit,damage,driver,police,happen','87-88','保险客服','说明一场小事故经过'],
    ['house-viewing','39','A2','U7','看房咨询','Ask about a home for sale','How long has the flat been for sale?','这套公寓出售多久了？','sale,flat,price,room,view,market','89-90','房产经纪人','询问房屋情况并预约看房'],
    ['future-arrangements','40','A2','U7','未来安排','Discuss future arrangements','When will you move into your new home?','你什么时候搬进新家？','will,move,neighbour,next,month,arrange','91-94','新邻居','说明未来的搬家安排'],
    ['lost-luggage','41','A2','U7','寻找行李','Describe a lost item','It is a small blue case with a black handle.','它是一个带黑色手柄的小蓝箱。','case,handle,small,blue,lost,belong','97-98','失物招领员','准确描述并找回行李'],
    ['message-relay','42','A2','U7','转述消息','Pass on a message','She says that she will arrive late.','她说她会晚到。','say,tell,message,arrive,late,that','99-102','同事','准确转述一条消息'],

    ['mistakes-feedback','43','A2','U8','理解修改意见','Respond to feedback','There are a few mistakes in this report.','这份报告里有几个错误。','mistake,report,correct,check,few,again','103-106','老师','理解错误并提出修改方案'],
    ['too-enough','44','A2','U8','太过与足够','Use too and enough','This bag is too heavy for me.','这个包对我来说太重了。','too,enough,heavy,light,large,small','103-107','商店店员','说明某物为什么不合适'],
    ['compare-options','45','A2','U8','比较选择','Compare two options','This model is cheaper and easier to use.','这个型号更便宜，也更容易使用。','cheap,expensive,easy,better,model,compare','107-112','产品顾问','比较两个方案并作出选择'],
    ['money-quantity','46','A2','U8','数量与零钱','Talk about quantity','I have some cash, but I do not have any change.','我有现金，但没有零钱。','some,any,none,change,cash,each','113-116','收银员','说明付款方式和零钱情况'],
    ['past-in-progress','47','A2','U8','当时正在做什么','Describe an interrupted action','I was having breakfast when you called.','你打电话时我正在吃早餐。','was,were,breakfast,call,when,happen','117-120','朋友','说明某事发生时正在做什么'],
    ['tell-a-story','48','A2','U8','讲一个小故事','Retell events in order','First I heard a noise, then I opened the door.','我先听到声音，然后打开了门。','first,then,suddenly,heard,opened,story','119-120','播客主持人','按顺序讲述一件真实小事'],

    ['describe-people','49','A2','U9','准确描述人物','Identify people clearly','The man who is wearing a hat is my uncle.','戴帽子的那位男士是我叔叔。','who,wear,hat,uncle,woman,identify','121-124','活动接待员','根据外貌找到正确的人'],
    ['obligation','50','A2','U9','必须与不必','Explain obligations','You have to book, but you do not need to pay now.','你需要预订，但现在不必付款。','have,need,book,pay,rule,must','125-126','活动客服','理解报名要求'],
    ['deduction','51','A2+','U9','做出推测','Make careful deductions','She might be our new manager.','她可能是我们的新经理。','might,must,cannot,sure,manager,perhaps','127-132','同事','根据线索做出合理推测'],
    ['reported-news','52','A2+','U9','转述新闻','Report what someone said','He told me that the meeting was cancelled.','他告诉我会议取消了。','told,said,news,meeting,cancel,report','133-136','团队成员','转述一条重要消息'],
    ['conditions','53','A2+','U9','条件与结果','Talk about conditions','If it rains, we will stay inside.','如果下雨，我们就待在室内。','if,rain,will,inside,plan,change','137-140','活动策划人','根据情况调整计划'],
    ['passive-service','54','A2+','U9','服务与流程','Describe a service process','Your order will be delivered tomorrow.','你的订单会在明天送达。','order,deliver,serve,invite,send,soon','141-144','客户服务人员','确认服务进度和结果']
  ];

  const grammarJudgments = {
    'greeting-politely': {sentence:'Excuse me. Is this seat free?',correct:true,grammarFocus:'be 动词一般疑问句',explanation:'is 已放在单数主语 this seat 前，疑问句结构正确。',correction:'Excuse me. Is this seat free?'},
    'introductions': {sentence:'Hi, I is Sequoia. Nice to meet you.',correct:false,grammarFocus:'主语 I 与 be 动词一致',explanation:'主语 I 后应使用 am，不能使用 is。',correction:'Hi, I am Sequoia. Nice to meet you.'},
    'identity-check': {sentence:'Are you a new student?',correct:true,grammarFocus:'单数身份名词前使用冠词 a',explanation:'student 是单数可数名词，a new student 的结构正确。',correction:'Are you a new student?'},
    'how-are-you': {sentence:'How is you today?',correct:false,grammarFocus:'主语 you 与 be 动词一致',explanation:'主语 you 应与 are 搭配，不能使用 is。',correction:'How are you today?'},
    'nationality': {sentence:'Where are you from?',correct:true,grammarFocus:'Where + be + 主语 + from',explanation:'询问来源地时，Where are you from? 的语序和搭配正确。',correction:'Where are you from?'},
    'jobs': {sentence:'What do you do?',correct:true,grammarFocus:'一般现在时疑问句的助动词 do',explanation:'主语 you 使用助动词 do，后面的实义动词保持原形。',correction:'What do you do?'},
    'possessions': {sentence:'Is this you bag?',correct:false,grammarFocus:'名词前使用物主限定词',explanation:'bag 前应使用表示“你的”的 your，不能使用主格 you。',correction:'Is this your bag?'},
    'colours': {sentence:'What colour are your jacket?',correct:false,grammarFocus:'单数主语与 be 动词一致',explanation:'主语 your jacket 是单数，be 动词应使用 is。',correction:'What colour is your jacket?'},
    'choose-one': {sentence:'Which one would you like?',correct:true,grammarFocus:'情态动词疑问句语序',explanation:'would 位于主语 you 前，like 保持原形，结构正确。',correction:'Which one would you like?'},
    'home-objects': {sentence:'The cups is in the cupboard.',correct:false,grammarFocus:'复数主语与 be 动词一致',explanation:'cups 是复数，be 动词应使用 are。',correction:'The cups are in the cupboard.'},
    'where-is-it': {sentence:'Where is my keys?',correct:false,grammarFocus:'复数主语与 be 动词一致',explanation:'my keys 是复数，be 动词应使用 are。',correction:'Where are my keys?'},
    'simple-instructions': {sentence:'Please put it on the table.',correct:true,grammarFocus:'祈使句使用动词原形',explanation:'please 后使用动词原形 put，结构正确。',correction:'Please put it on the table.'},
    'actions-now': {sentence:'What are you do now?',correct:false,grammarFocus:'现在进行时 be + V-ing',explanation:'are 后应使用 doing，构成现在进行时。',correction:'What are you doing now?'},
    'small-talk': {sentence:'The sun is shining, so we are walking.',correct:true,grammarFocus:'现在进行时 be + V-ing',explanation:'is shining 和 are walking 都符合现在进行时结构。',correction:'The sun is shining, so we are walking.'},
    'places-around': {sentence:'There is a café near my home.',correct:true,grammarFocus:'there be 与单数名词一致',explanation:'a café 是单数，因此使用 there is。',correction:'There is a café near my home.'},
    'future-intention': {sentence:"I'm going make dinner tonight.",correct:false,grammarFocus:'be going to + 动词原形',explanation:'going 后缺少 to，完整结构是 be going to + 动词原形。',correction:"I'm going to make dinner tonight."},
    'there-is': {sentence:'Is there any coffee left?',correct:true,grammarFocus:'there is 与不可数名词',explanation:'coffee 在这里是不可数名词，疑问句使用 Is there any...。',correction:'Is there any coffee left?'},
    'can-you': {sentence:'Can you to help me with this box?',correct:false,grammarFocus:'情态动词后使用动词原形',explanation:'can 后直接接 help，不使用 to。',correction:'Can you help me with this box?'},
    'coffee': {sentence:'Could I has a latte, please?',correct:false,grammarFocus:'情态动词后使用动词原形',explanation:'could 后应使用 have，不能使用 has。',correction:'Could I have a latte, please?'},
    'food-preferences': {sentence:'I like chicken, but I do not like beef.',correct:true,grammarFocus:'do not + 动词原形',explanation:'do not 后面的 like 保持原形，结构正确。',correction:'I like chicken, but I do not like beef.'},
    'climate': {sentence:'It is often warm and sunny here.',correct:true,grammarFocus:'频率副词在 be 动词后',explanation:'often 放在 is 后、形容词前，位置正确。',correction:'It is often warm and sunny here.'},
    'daily-routine': {sentence:'I usually starts work at nine.',correct:false,grammarFocus:'一般现在时主谓一致',explanation:'主语 I 后的动词使用原形 start，不加 -s。',correction:'I usually start work at nine.'},
    'unusual-day': {sentence:'I usually drive, but today I am walk.',correct:false,grammarFocus:'现在进行时 be + V-ing',explanation:'am 后应使用 walking，构成现在进行时。',correction:'I usually drive, but today I am walking.'},
    'time-plans': {sentence:'What time shall we meet?',correct:true,grammarFocus:'情态动词疑问句语序',explanation:'shall 位于主语 we 前，meet 保持原形，结构正确。',correction:'What time shall we meet?'},
    'at-the-doctor': {sentence:'I have bad cold and a headache.',correct:false,grammarFocus:'单数可数名词前使用冠词',explanation:'cold 表示一次感冒时是单数可数名词，前面需要 a。',correction:'I have a bad cold and a headache.'},
    'health-advice': {sentence:'You should to rest and drink some water.',correct:false,grammarFocus:'情态动词后使用动词原形',explanation:'should 后直接接 rest，不使用 to。',correction:'You should rest and drink some water.'},
    'permission-time': {sentence:'Can I stay out until ten?',correct:true,grammarFocus:'Can I + 动词原形询问许可',explanation:'can 后使用 stay，until 正确表示持续到十点。',correction:'Can I stay out until ten?'},
    'weekend-plans': {sentence:'What are you going to do this weekend?',correct:true,grammarFocus:'be going to 疑问句',explanation:'are 位于主语 you 前，going to 后接动词原形 do，结构正确。',correction:'What are you going to do this weekend?'},
    'past-location': {sentence:'Where was you yesterday afternoon?',correct:false,grammarFocus:'过去式 be 的主谓一致',explanation:'主语 you 应与 were 搭配，不能使用 was。',correction:'Where were you yesterday afternoon?'},
    'past-time': {sentence:'When did you arrived?',correct:false,grammarFocus:'did 后使用动词原形',explanation:'did 已表示过去，后面的动词应使用原形 arrive。',correction:'When did you arrive?'},
    'directions': {sentence:'How can I get the train station?',correct:false,grammarFocus:'get to + 地点',explanation:'表示到达某地时，get 后需要介词 to。',correction:'How can I get to the train station?'},
    'shopping': {sentence:'Do you have this in a smaller size?',correct:true,grammarFocus:'比较级修饰名词',explanation:'smaller 正确修饰 size，表示更小的尺码。',correction:'Do you have this in a smaller size?'},
    'restaurant': {sentence:"I'd like the roast chicken, please.",correct:true,grammarFocus:'would like + 名词',explanation:"I'd like 后直接接所点的食物，礼貌请求结构正确。",correction:"I'd like the roast chicken, please."},
    'holiday-prep': {sentence:"We're packing because we're leaving tomorrow.",correct:true,grammarFocus:'现在进行时表示已安排的未来',explanation:"we're leaving 可以表示已经确定的明日出发安排。",correction:"We're packing because we're leaving tomorrow."},
    'past-trip': {sentence:'I goed to Paris last spring.',correct:false,grammarFocus:'go 的不规则过去式',explanation:'go 的过去式是 went，不是 goed。',correction:'I went to Paris last spring.'},
    'transport-tickets': {sentence:"I'd like two return tickets to London, please.",correct:true,grammarFocus:'数量词后使用复数名词',explanation:'two 后使用复数 tickets，礼貌请求结构完整。',correction:"I'd like two return tickets to London, please."},
    'recent-actions': {sentence:'What have you did today?',correct:false,grammarFocus:'现在完成时 have + 过去分词',explanation:'do 的过去分词是 done，不能使用过去式 did。',correction:'What have you done today?'},
    'accident-report': {sentence:'A car has hit the gate.',correct:true,grammarFocus:'现在完成时 has + 过去分词',explanation:'单数主语 a car 使用 has，hit 的过去分词仍是 hit。',correction:'A car has hit the gate.'},
    'house-viewing': {sentence:'How long has the flat be for sale?',correct:false,grammarFocus:'现在完成时 has + been',explanation:'be 的过去分词是 been，完整结构是 has been。',correction:'How long has the flat been for sale?'},
    'future-arrangements': {sentence:'When will you move into your new home?',correct:true,grammarFocus:'will 疑问句语序',explanation:'will 位于主语 you 前，move 保持原形，结构正确。',correction:'When will you move into your new home?'},
    'lost-luggage': {sentence:'It is a small blue case with a black handle.',correct:true,grammarFocus:'多个形容词的顺序',explanation:'尺寸 small 位于颜色 blue 前，顺序正确。',correction:'It is a small blue case with a black handle.'},
    'message-relay': {sentence:'She say that she will arrive late.',correct:false,grammarFocus:'一般现在时第三人称单数',explanation:'主语 she 后应使用 says。',correction:'She says that she will arrive late.'},
    'mistakes-feedback': {sentence:'There are a few mistakes in this report.',correct:true,grammarFocus:'there be 与复数名词一致',explanation:'a few mistakes 是复数，因此使用 there are。',correction:'There are a few mistakes in this report.'},
    'too-enough': {sentence:'This bag is heavy too for me.',correct:false,grammarFocus:'too 位于形容词前',explanation:'表示“太重”时应使用 too heavy。',correction:'This bag is too heavy for me.'},
    'compare-options': {sentence:'This model is more cheaper than that one.',correct:false,grammarFocus:'避免双重比较级',explanation:'cheaper 已经是比较级，前面不能再加 more。',correction:'This model is cheaper than that one.'},
    'money-quantity': {sentence:'I have some cash, but I do not have any change.',correct:true,grammarFocus:'肯定句 some / 否定句 any',explanation:'肯定分句使用 some，否定分句使用 any，搭配正确。',correction:'I have some cash, but I do not have any change.'},
    'past-in-progress': {sentence:'I were having breakfast when you called.',correct:false,grammarFocus:'过去进行时主谓一致',explanation:'主语 I 在过去进行时中使用 was。',correction:'I was having breakfast when you called.'},
    'tell-a-story': {sentence:'First I heard a noise, then I opened the door.',correct:true,grammarFocus:'一般过去时叙述连续事件',explanation:'heard 和 opened 都使用过去式，时态一致。',correction:'First I heard a noise, then I opened the door.'},
    'describe-people': {sentence:'The man which is wearing a hat is my uncle.',correct:false,grammarFocus:'指人的关系代词 who',explanation:'先行词 the man 指人，应使用 who。',correction:'The man who is wearing a hat is my uncle.'},
    'obligation': {sentence:'You have to book before the event.',correct:true,grammarFocus:'have to + 动词原形',explanation:'have to 后使用动词原形 book，结构正确。',correction:'You have to book before the event.'},
    'deduction': {sentence:'She might be our new manager.',correct:true,grammarFocus:'情态动词 might + 动词原形',explanation:'might 后使用 be，结构正确。',correction:'She might be our new manager.'},
    'reported-news': {sentence:'He told that the meeting was cancelled.',correct:false,grammarFocus:'tell 后需要间接宾语',explanation:'tell 在这里要说明“告诉谁”，that 从句前需要 me 等宾语。',correction:'He told me that the meeting was cancelled.'},
    'conditions': {sentence:'If it rains, we will stay inside.',correct:true,grammarFocus:'第一条件句的时态',explanation:'if 从句使用一般现在时 rains，主句使用 will stay，结构正确。',correction:'If it rains, we will stay inside.'},
    'passive-service': {sentence:'Your order will delivered tomorrow.',correct:false,grammarFocus:'一般将来时被动语态',explanation:'一般将来时被动结构是 will be + 过去分词，will 后缺少 be。',correction:'Your order will be delivered tomorrow.'}
  };

  const grammarFillTargets = {
    'greeting-politely':['Is','this','free'],
    'introductions':['I','am','to'],
    'identity-check':['Are','you','a'],
    'how-are-you':['How','are','you'],
    'nationality':['Where','are','from'],
    'jobs':['What','do','do'],
    'possessions':['Is','this','your'],
    'colours':['colour','is','jacket'],
    'choose-one':['Which','would','like'],
    'home-objects':['cups','are','in'],
    'where-is-it':['Where','are','keys'],
    'simple-instructions':['Please','put','it'],
    'actions-now':['What','are','doing'],
    'small-talk':['is','shining','are'],
    'places-around':['There','is','a'],
    'future-intention':["I'm",'going','to'],
    'there-is':['Is','there','any'],
    'can-you':['Can','you','help'],
    'coffee':['Could','I','have'],
    'food-preferences':['do','not','like'],
    'climate':['is','often','warm'],
    'daily-routine':['I','usually','start'],
    'unusual-day':['usually','am','walking'],
    'time-plans':['shall','we','meet'],
    'at-the-doctor':['I','a','cold'],
    'health-advice':['should','rest','drink'],
    'permission-time':['Can','stay','until'],
    'weekend-plans':['are','going','to'],
    'past-location':['Where','were','you'],
    'past-time':['When','did','arrive'],
    'directions':['can','get','to'],
    'shopping':['a','smaller','size'],
    'restaurant':["I'd",'like','chicken'],
    'holiday-prep':["We're",'packing','leaving'],
    'past-trip':['I','went','last'],
    'transport-tickets':['two','return','tickets'],
    'recent-actions':['What','have','done'],
    'accident-report':['car','has','hit'],
    'house-viewing':['has','been','for'],
    'future-arrangements':['When','will','move'],
    'lost-luggage':['a','small','blue'],
    'message-relay':['She','says','will'],
    'mistakes-feedback':['There','are','mistakes'],
    'too-enough':['is','too','heavy'],
    'compare-options':['is','cheaper','than'],
    'money-quantity':['some','but','any'],
    'past-in-progress':['I','was','having'],
    'tell-a-story':['heard','then','opened'],
    'describe-people':['man','who','is'],
    'obligation':['have','to','book'],
    'deduction':['might','be','manager'],
    'reported-news':['told','me','that'],
    'conditions':['If','rains','will'],
    'passive-service':['will','be','delivered']
  };

  const judgmentPlaceholderPattern = /_{2,}|\[\s*\]|\{\s*blank\s*\}|<blank>|…{2,}/i;
  function validateGrammarJudgment(id, judgment) {
    const requiredText = ['sentence','grammarFocus','explanation','correction'];
    const missing = requiredText.filter(key => !String(judgment?.[key] || '').trim());
    if (missing.length || typeof judgment?.correct !== 'boolean') throw new Error(`[curriculum:${id}] 语法判断题字段不完整：${missing.join(', ')}`);
    if (judgmentPlaceholderPattern.test(judgment.sentence) || judgmentPlaceholderPattern.test(judgment.correction)) throw new Error(`[curriculum:${id}] 判断题不能包含填空占位符`);
    if (!/[.?!]$/.test(judgment.sentence.trim()) || !/[.?!]$/.test(judgment.correction.trim())) throw new Error(`[curriculum:${id}] 判断句和标准句必须是完整句`);
    if (!judgment.correct && judgment.sentence.trim() === judgment.correction.trim()) throw new Error(`[curriculum:${id}] 错误句必须与标准句不同`);
    if (judgment.correct && judgment.sentence.trim() !== judgment.correction.trim()) throw new Error(`[curriculum:${id}] 正确句的标准表达应与题目一致`);
    const targets = grammarFillTargets[id];
    if (!Array.isArray(targets) || targets.length !== 3) throw new Error(`[curriculum:${id}] 必须配置 3 个语法填空槽位`);
    const availableTokens = [...judgment.correction.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)].map(match => match[0].toLowerCase());
    targets.forEach(target => {
      const targetIndex = availableTokens.indexOf(target.toLowerCase());
      if (targetIndex < 0) throw new Error(`[curriculum:${id}] 语法填空目标“${target}”不在标准句中`);
      availableTokens.splice(targetIndex,1);
    });
    return Object.freeze({...judgment,kind:'grammar-judgment',targets:Object.freeze([...targets])});
  }

  const levels = {'Pre-A1':'Pre-A1','A1':'A1','A1+':'A1','A2':'A2','A2+':'A2'};
  const lessons = rows.map((row,index) => {
    const [id,number,band,unit,title,subtitle,phrase,meaning,wordCsv,refs,aiRole,mission] = row;
    const words = wordCsv.split(',');
    const level = levels[band];
    const grammarJudgment = validateGrammarJudgment(id,grammarJudgments[id]);
    return {
      id,number,order:index+1,band,level,unit,unitTitle:unitNames[unit],icon:icons[index%icons.length],title,subtitle,status:index < 4 ? 'published':'draft',visible:index < 4,
      phrase,phonetic:'',summary:`完成本课后，学习者能够${mission}。`,meaning,answerTip:`先掌握核心表达“${phrase}”，再替换关键词完成自己的表达。`,
      vocabulary:words.map(word => [word,'',word]),sourceRefs:`第一册 Lesson ${refs} · 提取主题与语言递进，内容为原创改写`,
      exercisePatterns:['判断完整句中的单一语法点','在完整句中补全语法成分','在 AI 场景中完成真实任务'],
      grammarJudgment,warmupWrong:grammarJudgment.sentence,warmupCorrect:grammarJudgment.correction,warmupIsCorrect:grammarJudgment.correct,warmupGrammarFocus:grammarJudgment.grammarFocus,warmupExplanation:grammarJudgment.explanation,
      aiRole,mission,opening:`Hi! I'm Maya. Let's practise: ${title}.`,hint:phrase,briefing:`你正在进行“${title}”场景练习，Maya 扮演${aiRole}。`,
      completionGoals:[mission,`使用核心表达：${phrase}`,'自然回应一次追问'],versions:[]
    };
  });
  window.HELLO_LEARNER_CURRICULUM = {version:1,units:unitNames,lessons};
})();
