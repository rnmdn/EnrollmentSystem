// Fictional faculty used only by the isolated practice fixtures.
export const practiceRooms = [...Array.from({length:10},(_,i)=>String(601+i)),...Array.from({length:4},(_,i)=>`Lab ${i+1}`)];
const faculty = [
  ['Ana Reyes','Marco Santos','Elena Cruz','Paolo Garcia','Mia Flores','Luis Ramos','Nina Torres'],
  ['Carlo Mendoza','Sofia Navarro','Jose Bautista','Lara Castillo','Rafael Lim','Bea Aquino','Miguel Rivera','Clara Villanueva'],
  ['Andrea Diaz','Daniel Soriano','Isabel Morales','Gabriel Tan','Camille Lopez','Adrian Perez','Diana Santiago'],
  ['Julian Fernandez','Patricia Gonzales','Enzo Mercado'],
];
export const practiceProfessor = (year,index) => 'Prof. '+faculty[year-1][index];
export const retakeProfessor = index => 'Prof. '+['Teresa Valencia','Martin Salazar','Rosa Dela Pena'][index];
export const practiceClassRoom = (year,code) => /^(COMP|IT|CS)\s/.test(code) ? `Lab ${year}` : String(600+year);
