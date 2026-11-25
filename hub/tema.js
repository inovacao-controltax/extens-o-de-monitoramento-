/* Aplica o tema salvo antes de a página aparecer (mesma chave do Control Hub). */
try{var t=localStorage.getItem('controlhub-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}
