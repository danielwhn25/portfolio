/* Diagnostic: print the bounding box each Gerber layer occupies. */
import { readFileSync } from 'node:fs';
import gerberToSvg from 'gerber-to-svg';

const jobs = [
  ['TG cu',   'C:/Altium/ESP_MASTER/Project Outputs for ESP_MASTER/ESP_Layout_2.1.GTL'],
  ['TG silk', 'C:/Altium/ESP_MASTER/Project Outputs for ESP_MASTER/ESP_Layout_2.1.GTO'],
  ['TG edge', 'C:/Altium/ESP_MASTER/Project Outputs for ESP_MASTER/ESP_Layout_2.1.GM'],
  ['POE cu',  'C:/Altium/POE/Project Outputs for POE/POE_Copper_Signal_1.gbr'],
  ['POE edg', 'C:/Altium/POE/Project Outputs for POE/POE_Profile.gbr'],
  ['POE m1',  'C:/Altium/POE/Project Outputs for POE/POE_Mechanical_1.gbr'],
  ['IR cu',   'C:/Altium/IR_transmitter/Project Outputs for IR_transmitter/IR_remote.GBL'],
  ['IR silk', 'C:/Altium/IR_transmitter/Project Outputs for IR_transmitter/IR_remote.GBO'],
  ['IR edge', 'C:/Altium/IR_transmitter/Project Outputs for IR_transmitter/IR_remote.GM']
];

for (const [name, file] of jobs) {
  await new Promise(done => {
    gerberToSvg(readFileSync(file, 'utf8'), { id: 'x' }, (err, svg) => {
      if (err) { console.log(name.padEnd(9), 'ERROR', err.message); return done(); }
      const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
      console.log(name.padEnd(9), `x=${vb[0].toFixed(0)} y=${vb[1].toFixed(0)} w=${vb[2].toFixed(0)} h=${vb[3].toFixed(0)}  ratio=${(vb[2] / vb[3]).toFixed(2)}`);
      done();
    });
  });
}
