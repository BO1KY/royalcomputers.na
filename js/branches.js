window.BRANCHES=(function(){"use strict";const n=[{id:"branch-001",name:"Royal Computers - Gustav Voigts Centre, Windhoek",city:"Windhoek",address:"GF Shop 12 Gustav Voigts Center, Independence Ave",phone:"061228179",whatsapp:"+264813631483",email:"windhoek@royalcomputers.na",coordinates:{lat:-22.5579,lng:17.0832},hours:"Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: 09:00 - 13:00",image:"ROYAL PICS/gustav.webp",isHeadquarters:!0,description:"Main headquarters store with complete inventory and service center"},{id:"branch-002",name:"Royal Computers - Swakopmund",city:"Swakopmund",address:"Shop 03 Minette Court Sam Nujoma Street",phone:"064406914",whatsapp:"+264818031126",email:"swakop@royalcomputers.na",coordinates:{lat:-22.6797,lng:14.5301},hours:"Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: Closed ",image:"ROYAL PICS/Swakop.webp",isHeadquarters:!1,description:"Coastal branch serving the Erongo region"},{id:"branch-003",name:"Royal Computers - Oshakati",city:"Oshakati",address:"Shop 42 Etango Complex",phone:"065227045",whatsapp:"+264816540001",email:"oshakati@royalcomputers.na",coordinates:{lat:-17.3041,lng:15.7039},hours:"Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: Closed",image:"ROYAL PICS/Oshakati.webp",isHeadquarters:!1,description:"Northern branch serving Oshana and Kunene regions"},{id:"branch-004",name:"Royal Computers - Walvis Bay",city:"Walvis Bay",address:"111 Hage Geingob Street Office C",phone:"064200453",whatsapp:"+264816413220",email:"walvisbay@royalcomputers.na",coordinates:{lat:-22.9976,lng:14.5057},hours:"Mon-Fri: 08:00 - 17:30 | Sat: 09:00 - 13:00 | Sun: Closed",image:"ROYAL PICS/Walvisbay.webp",isHeadquarters:!1,description:"Port city branch with specialized logistics support"},{id:"branch-005",name:"Royal Computers - Tsumeb",city:"Tsumeb",address:"Shop 03 Tsumeb Shopping Mall",phone:"+264818163936",whatsapp:"+26481816396",email:"tsumeb@royalcomputers.na",coordinates:{lat:-19.2505,lng:16.9149},hours:"Mon-Fri: 08:30 - 17:30 | Sat: 09:00 - 13:30 | Sun: Closed",image:"ROYAL PICS/Tsumeb.webp",isHeadquarters:!1,description:"Mining region branch serving Otjozondjupa"},{id:"branch-006",name:"Royal Computers - Grove Mall, Windhoek",city:"Windhoek",address:"GF Shop 256 Grove Mall",phone:"061242938",whatsapp:"+264818031124",email:"grove@royalcomputers.na",coordinates:{lat:-22.5481,lng:17.0654},hours:"Mon-Fri: 09:00 - 19:00 | Sat: 09:00 - 17:00 | Sun: 10:00 - 15:00",image:"ROYAL PICS/Grove.webp",isHeadquarters:!1,description:"Mall branch at Grove Mall of Namibia"}],a={name:"ROYAL COMPUTERS ",logo:"ROYAL PICS/royal logo.png",website:"www.royalcomputers.na",businessReg:"P O BOX 6687, AUSSPANPLATZ, Windhoek",taxId:"Tax ID: 4686005015",tagline:"Leading the way in digital lifestyle"};function s(){return n}function i(e){return n.find(t=>t.id===e)||null}function o(){return n.find(e=>e.isHeadquarters)||n[0]}function l(e){return n.find(t=>t.city.toLowerCase()===e.toLowerCase())||null}function c(e){return e?`${e.name}
${e.address}
Phone: ${e.phone}
Email: ${e.email}
Hours: ${e.hours}`:""}function p(){return a}function d(){return`
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 4px 0; color: #e5383b;">
          ${a.name}
        </h2>
        <p style="font-size: 12px; color: #6b7280; margin: 4px 0; letter-spacing: 0.5px;">
          ${a.tagline}
        </p>
        <p style="font-size: 11px; color: #9ca3af; margin: 8px 0 0 0;">
          ${a.businessReg} | ${a.taxId}
        </p>
      </div>
    `}function h(e){return e||(e=o()),`
      <div style="background: #f8f8f9; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0; color: #e5383b;">
          Collection Branch
        </h3>
        <div style="font-size: 13px; line-height: 1.6; color: #1a1a1a;">
          <p style="margin: 0 0 8px 0;"><strong>${e.name}</strong></p>
          <p style="margin: 0 0 4px 0;">${e.address}</p>
          <p style="margin: 0 0 4px 0;"><strong>Phone:</strong> <a href="tel:${e.phone}" style="color: #e5383b; text-decoration: none;">${e.phone}</a></p>
          <p style="margin: 0 0 4px 0;"><strong>Email:</strong> <a href="mailto:${e.email}" style="color: #e5383b; text-decoration: none;">${e.email}</a></p>
          <p style="margin: 0;"><strong>Hours:</strong> ${e.hours}</p>
        </div>
      </div>
    `}function u(){return n.map(e=>`<option value="${e.id}" ${e.isHeadquarters?"selected":""}>
        ${e.name} (${e.city})
      </option>`).join("")}function r(e){return n.some(t=>t.id===e)}function g(e){r(e)&&localStorage.setItem("royalquote_selectedbranch",e)}function m(){const e=localStorage.getItem("royalquote_selectedbranch");return e&&r(e)?i(e):o()}return{getAllBranches:s,getBranchById:i,getDefaultBranch:o,getBranchByCity:l,formatBranchInfo:c,getCompanyInfo:p,getCompanyHeader:d,getBranchDetailsSection:h,getBranchOptionsHTML:u,isValidBranch:r,saveBranchSelection:g,getSavedBranchSelection:m}})();
