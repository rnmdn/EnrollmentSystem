// Transcribed from the two scanned 2022–2023 curricula supplied for this project.
// Semester 3 is the printed Summer block, not Semester 2.
const subjects = [];
function block(program, yearLevel, semester, rows) {
  for (const [code, title, prerequisites = '', units = 3, minimumYear = 0, minimumPassedUnits = 0] of rows) subjects.push({code,title,program,yearLevel,semester,units,prerequisites,minimumYear,minimumPassedUnits});
}
const it = 'BS Information Technology', cs = 'BS Computer Science';
const first = [
  ['GE 003','The Contemporary World with Peace Education'],
  ['GE 006','Art Appreciation'],
  ['GE 004','Mathematics in the Modern World'],
  ['COMP 101','Introduction to Computing'],
  ['COMP 102','Fundamentals of Programming (C++)'],
  ['PE 101','Wellness and Fitness','',2],
  ['NSTP 101','National Service Training Program (CWTS/ROTC)'],
];
const firstSecond = [
  ['GE 001','Understanding the Self'],
  ['GE 005','Purposive Communication'],
  ['GE 007','Science, Technology and Society'],
  ['GEE 001','GE Elective 1'],
  ['COMP 103','Intermediate Programming (Java)','COMP 102'],
];
const firstEnd = [['PE 102','Self-Defense','',2],['NSTP 102','National Service Training Program (CWTS/ROTC)']];
const second = [
  ['GE 008','Ethics'],['GEE 002','GE Elective 2'],
  ['COMP 104','Data Structures and Algorithms','COMP 103'],
  ['COMP 105','Information Management','COMP 103'],
];
const history = ['GE 002',"Readings in Philippine History with Indigenous Peoples' Education"];
block(it,1,1,first);
block(it,1,2,[...firstSecond,['IT 101','Discrete Mathematics','COMP 101'],...firstEnd]);
block(it,2,1,[...second,
  ['IT 102','Quantitative Methods','IT 101'],
  ['IT 201','IT Elective: Platform Technologies','COMP 103'],
  ['IT 202','IT Elective: Object-Oriented Programming (VB.Net)','COMP 103'],
  ['PE 103','Individual/Dual Games and Sports','',2],
]);
block(it,2,2,[history,['GEE 003','GE Elective 3'],
  ['IT 103','Advanced Database Systems','COMP 105'],
  ['IT 104','Integrative Programming and Technologies I','IT 201, IT 202'],
  ['IT 105','Networking I','IT 201'],
  ['IT 301','Web Programming','COMP 103'],
  ['COMP 106','Applications Development and Emerging Technologies','COMP 105'],
  ['PE 104','Team Games and Sports','',2],
]);
block(it,3,1,[['GE 009',"Rizal's Life and Works"],
  ['IT 106','Systems Integration and Architecture I','IT 104'],
  ['IT 107','Networking II','IT 105'],
  ['IT 302','Software Engineering','COMP 105'],
  ['IT 303','Technopreneurship','',3,3,81],
  ['IT 304','IT Professional Ethics'],
  ['IT 305','Web Development','IT 301'],
]);
block(it,3,2,[
  ['IT 108','Information Assurance and Security I','IT 106'],
  ['IT 109','Introduction to Human Computer Interaction','COMP 102'],
  ['IT 110','Social and Professional Issues','',3,3,81],
  ['IT 203','IT Elective: Integrative Programming and Technologies II','IT 104'],
  ['IT 306','Multimedia and Technologies'],
]);
block(it,3,3,[
  ['IT 111','IT Capstone Project I','IT 108, COMP 106, IT 302'],
  ['IT 112','Information Assurance and Security II','IT 108, COMP 106'],
]);
block(it,4,1,[
  ['IT 113','System Administration and Maintenance','IT 112'],
  ['IT 114','IT Capstone Project II','IT 111'],
  ['IT 204','IT Elective: Systems Integration and Architecture II','IT 106'],
]);
block(it,4,2,[['IT 115','On-the-Job Training (486 hours)','IT 108, COMP 106',6]]);

block(cs,1,1,first);
block(cs,1,2,[...firstSecond,['CS 101','Discrete Structures I'],...firstEnd]);
block(cs,2,1,[...second,
  ['CS 102','Discrete Structures II','CS 101'],
  ['CS 103','Object-Oriented Programming (VB.Net with Database)','CS 101, COMP 103'],
  ['PE 103','Individual/Dual Games and Sports','',2],
]);
block(cs,2,2,[history,['GEE 003','GE Elective 3'],
  ['CS 104','Algorithms and Complexity','CS 101, COMP 104'],
  ['CS 105','Software Engineering I','COMP 105, CS 103'],
  ['CS 301','Math Elective: Linear Algebra','',3,2,40],
  ['CS 402','Web Programming Development','',3,2,40],
  ['COMP 106','Application Development and Emerging Technologies','COMP 105'],
  ['PE 104','Team Games and Sports','',2],
]);
block(cs,3,1,[['GE 009',"Rizal's Life and Works"],
  ['CS 401','Digital Design','CS 101'],
  ['CS 106','Automata Theory and Formal Languages','CS 104'],
  ['CS 107','Architecture and Organization','CS 101, COMP 104'],
  ['CS 108','Information Assurance and Security','COMP 105',2],
  ['CS 109','Software Engineering II','CS 105'],
  ['CS 201','CS Elective: Intelligent Systems'],
  ['CS 403','Open Source Programming with Database','CS 402'],
]);
block(cs,3,2,[
  ['CS 110','Operating Systems','COMP 104'],
  ['CS 111','Programming Languages','COMP 104'],
  ['CS 112','Social Issues and Professional Practice','CS 109'],
  ['CS 202','CS Elective: Parallel and Distributed Programming'],
  ['CS 405','Open Source Programming with Framework','CS 403'],
  ['CS 404','Multimedia Systems'],
]);
block(cs,3,3,[['CS 115','CS Thesis 1','CS 109']]);
block(cs,4,1,[
  ['CS 114','Human Computer Interaction','COMP 103',1],
  ['CS 117','CS Thesis 2','CS 115'],
  ['CS 203','CS Elective: Graphics and Visual Computing'],
  ['CS 406','Robotics'],
]);
block(cs,4,2,[
  ['CS 116','Networks and Communications','COMP 103'],
  ['CS 113','On-the-Job Training Program (162 hours)','',3,4,118],
]);

export const plpCurriculum2022 = {
  version:'2022–2023',
  sources:[
    {program:it,file:'2022-BSIT-Curriculum (1).pdf',url:'/curriculum/2022-bsit.pdf',expectedSubjects:49,expectedUnits:146},
    {program:cs,file:'2022-BSCS-Curriculum.pdf',url:'/curriculum/2022-bscs.pdf',expectedSubjects:51,expectedUnits:146},
  ],
  subjects,
  electiveOptions: {
    'Mathematics, Science & Technology':['Environmental Science','Human Reproduction',"People and the Earth's Ecosystem",'Living in the IT Era'],
    'Social Science and Philosophy':['Philippine Indigenous Communities','Gender and Society','Business Logic','Religions, Religious Experience and Spirituality','The Entrepreneurial Mind'],
    'Arts and Humanities':['Great Books','Reading Visual Arts','Philippine Popular Culture','Indigenous Creative Crafts'],
  },
};
