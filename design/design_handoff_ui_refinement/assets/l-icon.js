(function(){
  function pascal(n){return n.split('-').map(function(s){return s.charAt(0).toUpperCase()+s.slice(1);}).join('');}
  class LIcon extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'});
      var st=document.createElement('style');
      st.textContent=':host{display:inline-flex;flex:0 0 auto;line-height:0}svg{display:block}';
      this.shadowRoot.appendChild(st);
    }
    static get observedAttributes(){return['name','size'];}
    connectedCallback(){this.render();}
    attributeChangedCallback(){this.render();}
    render(){
      var self=this;
      (function attempt(tries){
        if(!window.lucide||!(window.lucide.icons||window.lucide.createElement)){
          if(tries<100)setTimeout(function(){attempt(tries+1);},60);
          return;
        }
        var name=pascal(self.getAttribute('name')||'circle');
        var icons=window.lucide.icons||window.lucide;
        var alias={CheckCircle2:'CircleCheckBig',CircleCheckBig:'CheckCircle2',CircleAlert:'AlertCircle',AlertCircle:'CircleAlert',BarChart3:'ChartColumnBig'};
        var icon=icons[name]||icons[alias[name]];
        var old=self.shadowRoot.querySelector('svg');
        if(old)old.remove();
        if(icon){
          var el=window.lucide.createElement(icon);
          var size=self.getAttribute('size')||16;
          el.setAttribute('width',size);el.setAttribute('height',size);
          self.shadowRoot.appendChild(el);
        }
      })(0);
    }
  }
  if(!customElements.get('l-icon'))customElements.define('l-icon',LIcon);
})();
