function switchMode(el) {
    console.log("hi");
    const bodyClass = document.body.classList;
    console.log(bodyClass);
    bodyClass.contains('dark')
      ? (el.innerHTML = '☀️', bodyClass.remove('dark'))
      : (el.innerHTML = '🌙', bodyClass.add('dark')); 
}
  