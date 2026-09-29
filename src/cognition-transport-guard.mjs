export const COGNITION_PERIMETER_ADMISSION='UBERBOND_COGNITION_PERIMETER_V1';
export function assertCognitionPerimeterAdmission(value){
 if(value!==COGNITION_PERIMETER_ADMISSION) throw new Error('cognition-economic-perimeter-admission-required');
 return true;
}
