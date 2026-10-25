export const HEARING_GROUPS=[
  {key:'moan',label:'呻吟',kind:'reactive',minStreak:2,cooldownMs:7000,members:[{index:22,threshold:.22},{index:33,threshold:.25}],singleThreshold:.58},
  {key:'breathing',label:'喘息',kind:'reactive',minStreak:2,cooldownMs:7000,members:[{index:40,threshold:.24},{index:36,threshold:.34}],singleThreshold:.60},
  {key:'gasp',label:'倒抽气',kind:'reactive',minStreak:1,cooldownMs:7000,members:[{index:39,threshold:.30}],singleThreshold:.48},
  {key:'snoring',label:'打鼾',kind:'reactive',minStreak:2,cooldownMs:12000,members:[{index:38,threshold:.28}],singleThreshold:.58},
  {key:'laughter',label:'笑声',kind:'reactive',minStreak:1,cooldownMs:7000,members:[{index:13,threshold:.28},{index:15,threshold:.28},{index:17,threshold:.30}],singleThreshold:.48},
  {key:'crying',label:'哭声',kind:'reactive',minStreak:2,cooldownMs:10000,members:[{index:19,threshold:.28},{index:20,threshold:.34}],singleThreshold:.58},
  {key:'cough',label:'咳嗽',kind:'reactive',minStreak:1,cooldownMs:6000,members:[{index:42,threshold:.30}],singleThreshold:.46},
  {key:'sneeze',label:'喷嚏',kind:'reactive',minStreak:1,cooldownMs:6000,members:[{index:44,threshold:.30}],singleThreshold:.46},
  {key:'footsteps',label:'脚步声',kind:'ambient',minStreak:2,cooldownMs:14000,members:[{index:48,threshold:.26}]},
  {key:'snap',label:'打响指',kind:'reactive',minStreak:1,cooldownMs:7000,members:[{index:57,threshold:.32}],singleThreshold:.48},
  {key:'clap',label:'拍手声',kind:'reactive',minStreak:1,cooldownMs:7000,members:[{index:58,threshold:.30}],singleThreshold:.46},

  {key:'dog',label:'狗叫',kind:'ambient',minStreak:2,cooldownMs:15000,members:[{index:69,threshold:.25},{index:70,threshold:.27},{index:73,threshold:.28}]},
  {key:'cat',label:'猫叫',kind:'ambient',minStreak:2,cooldownMs:15000,members:[{index:76,threshold:.26},{index:77,threshold:.28},{index:78,threshold:.28}]},
  {key:'bird',label:'鸟叫',kind:'ambient',minStreak:2,cooldownMs:15000,members:[{index:106,threshold:.24},{index:107,threshold:.24},{index:108,threshold:.28}]},

  {key:'music',label:'音乐',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:132,threshold:.24},{index:241,threshold:.28},{index:262,threshold:.24}]},
  {key:'crowd',label:'人群/谈话背景',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:63,threshold:.25},{index:64,threshold:.25},{index:65,threshold:.25}]},
  {key:'wind',label:'风声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:277,threshold:.24},{index:278,threshold:.24}]},
  {key:'thunder',label:'雷声',kind:'reactive',minStreak:1,cooldownMs:12000,members:[{index:280,threshold:.27},{index:281,threshold:.30}],singleThreshold:.48},
  {key:'rain',label:'雨声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:283,threshold:.23},{index:284,threshold:.28},{index:285,threshold:.23}]},
  {key:'running_water',label:'流水声',kind:'ambient',minStreak:2,cooldownMs:16000,members:[{index:282,threshold:.23},{index:286,threshold:.25},{index:287,threshold:.27}]},
  {key:'ocean',label:'海浪声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:288,threshold:.24},{index:289,threshold:.24}]},
  {key:'fire',label:'火焰/噼啪声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:292,threshold:.26},{index:293,threshold:.24}]},

  {key:'traffic',label:'道路交通声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:300,threshold:.25},{index:301,threshold:.25},{index:308,threshold:.28},{index:321,threshold:.24}]},
  {key:'train',label:'火车声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:322,threshold:.24},{index:323,threshold:.27},{index:328,threshold:.27}]},
  {key:'aircraft',label:'飞机/直升机声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:329,threshold:.24},{index:333,threshold:.27},{index:334,threshold:.27}]},

  {key:'door',label:'门声',kind:'reactive',minStreak:1,cooldownMs:9000,members:[{index:348,threshold:.28},{index:351,threshold:.30},{index:352,threshold:.30}],singleThreshold:.50},
  {key:'doorbell',label:'门铃',kind:'reactive',minStreak:1,cooldownMs:9000,members:[{index:349,threshold:.30},{index:350,threshold:.30}],singleThreshold:.48},
  {key:'knock',label:'敲门/敲击声',kind:'reactive',minStreak:1,cooldownMs:8000,members:[{index:353,threshold:.30},{index:354,threshold:.28}],singleThreshold:.46},
  {key:'dishes',label:'餐具碰撞声',kind:'ambient',minStreak:2,cooldownMs:15000,members:[{index:358,threshold:.25},{index:359,threshold:.27},{index:435,threshold:.30},{index:436,threshold:.25}]},
  {key:'cooking',label:'做饭声',kind:'ambient',minStreak:2,cooldownMs:16000,members:[{index:360,threshold:.27},{index:361,threshold:.24},{index:363,threshold:.28}]},
  {key:'sink',label:'水龙头/洗涤声',kind:'ambient',minStreak:2,cooldownMs:16000,members:[{index:364,threshold:.23},{index:365,threshold:.23},{index:366,threshold:.25},{index:368,threshold:.28}]},
  {key:'hairdryer',label:'吹风机声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:367,threshold:.25}]},
  {key:'vacuum',label:'吸尘器声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:371,threshold:.25}]},
  {key:'typing',label:'键盘/打字声',kind:'ambient',minStreak:2,cooldownMs:15000,members:[{index:378,threshold:.24},{index:380,threshold:.24}]},
  {key:'alarm',label:'闹钟/警报声',kind:'reactive',minStreak:1,cooldownMs:12000,members:[{index:382,threshold:.28},{index:389,threshold:.30},{index:393,threshold:.30},{index:394,threshold:.30}],singleThreshold:.48},
  {key:'phone',label:'电话铃声',kind:'reactive',minStreak:1,cooldownMs:12000,members:[{index:383,threshold:.27},{index:384,threshold:.28},{index:385,threshold:.28}],singleThreshold:.48},
  {key:'siren',label:'警笛声',kind:'reactive',minStreak:1,cooldownMs:12000,members:[{index:317,threshold:.28},{index:318,threshold:.28},{index:319,threshold:.28},{index:390,threshold:.26}],singleThreshold:.46},
  {key:'clock',label:'钟表声',kind:'ambient',minStreak:2,cooldownMs:18000,members:[{index:400,threshold:.28},{index:401,threshold:.30},{index:402,threshold:.28}]},
  {key:'bell',label:'铃铛声',kind:'reactive',minStreak:1,cooldownMs:10000,members:[{index:195,threshold:.28},{index:197,threshold:.30},{index:198,threshold:.30}],singleThreshold:.48},

  {key:'vibration',label:'震动声',kind:'ambient',minStreak:2,cooldownMs:12000,members:[{index:517,threshold:.28},{index:125,threshold:.34},{index:370,threshold:.38},{index:376,threshold:.38},{index:490,threshold:.36}],singleThreshold:.58},
  {key:'water',label:'水声',kind:'ambient',minStreak:2,cooldownMs:14000,members:[{index:282,threshold:.24},{index:438,threshold:.25},{index:439,threshold:.25},{index:291,threshold:.28},{index:442,threshold:.25},{index:443,threshold:.24},{index:444,threshold:.24},{index:446,threshold:.26}],singleThreshold:.52},
  {key:'wet',label:'黏湿的水声',kind:'reactive',minStreak:1,cooldownMs:9000,members:[{index:441,threshold:.24},{index:440,threshold:.26}],singleThreshold:.44},
  {key:'slap',label:'拍打声',kind:'reactive',minStreak:1,cooldownMs:8000,members:[{index:461,threshold:.28},{index:454,threshold:.34},{index:58,threshold:.34}],singleThreshold:.46}
];

export const HEARING_LABELS=Object.freeze(Object.fromEntries(HEARING_GROUPS.map(group=>[group.key,group.label])));
export const REACTIVE_HEARING_KEYS=new Set(HEARING_GROUPS.filter(group=>group.kind==='reactive').map(group=>group.key));
