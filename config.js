/* Where the invitations live. The key is Supabase's public (anon) key: it is meant to sit in a web page, and it can
   only call the dinner's functions, which each check the secret code in the link. Empty values mean design preview */
window.DINNER_CONFIG={url:'',key:''};
