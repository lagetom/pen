export function syncNumbers(root: ParentNode = document) {
  for (const field of root.querySelectorAll<HTMLInputElement>('input[data-range]')) {
    const range=document.getElementById(field.dataset.range!) as HTMLInputElement;
    if(document.activeElement!==field)field.value=range.value;
  }
}
export function bindNumbers() {
  for(const field of document.querySelectorAll<HTMLInputElement>('input[data-range]')){
    const range=document.getElementById(field.dataset.range!) as HTMLInputElement;
    range.addEventListener('input',()=>{field.value=range.value;field.setCustomValidity('');});
    field.addEventListener('input',()=>{
      const value=field.valueAsNumber;
      if(!field.value.trim() || !Number.isFinite(value) || !Number.isInteger(value)){field.setCustomValidity('정수를 입력하세요.');return;}
      const clamped=Math.max(Number(range.min),Math.min(Number(range.max),value));
      field.setCustomValidity('');field.value=String(clamped);range.value=String(clamped);range.dispatchEvent(new Event('input',{bubbles:true}));
    });
    field.addEventListener('change',()=>{if(field.validity.valid&&field.value.trim())range.dispatchEvent(new Event('change',{bubbles:true}));});
    field.addEventListener('blur',()=>{field.setCustomValidity('');field.value=range.value;});
  }
  syncNumbers();
}
