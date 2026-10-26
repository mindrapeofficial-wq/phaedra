#include <lv2/core/lv2.h>
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

extern const LV2_Descriptor* lv2_descriptor(uint32_t);
enum { N=4096 };
static float input_l[N],input_r[N],out_l[N],out_r[N];
int main(void) {
    const LV2_Descriptor* d=lv2_descriptor(0);
    assert(d && !lv2_descriptor(1));
    assert(strcmp(d->URI,"https://phaedra.arcanumgames.es/plugins/ds")==0);
    LV2_Handle h=d->instantiate(d,48000,NULL,NULL);
    assert(h);
    float threshold=-50,range=12,frequency=4000,attack=1,release=70;
    float lookahead=0,link=100,mix=100,mode=1,processing=0,audition=0,bypass=0;
    float reduction=0,latency=0;
    void* ports[]={input_l,input_r,out_l,out_r,&threshold,&range,&frequency,&attack,
                   &release,&lookahead,&link,&mix,&mode,&processing,&audition,&bypass,
                   &reduction,&latency};
    for(unsigned i=0;i<18;++i) d->connect_port(h,i,ports[i]);
    d->activate(h);
    float low_error=0,high_error=0;
    for(int i=0;i<N;++i) input_l[i]=input_r[i]=0.5f*sinf(6.2831853f*500*i/48000);
    d->run(h,N);
    for(int i=0;i<N;++i) low_error+=fabsf(out_l[i]-input_l[i]);
    d->activate(h);
    for(int i=0;i<N;++i) input_l[i]=input_r[i]=0.5f*sinf(6.2831853f*9000*i/48000);
    d->run(h,N);
    for(int i=0;i<N;++i) high_error+=fabsf(out_l[i]-input_l[i]);
    assert(high_error>low_error*2);
    assert(reduction>0 && reduction<=12.001f);
    lookahead=5; bypass=1; d->activate(h);
    d->run(h,N);
    assert(latency==240);
    assert(fabsf(out_l[0])<0.000001f);
    assert(fabsf(out_l[240]-input_l[0])<0.000001f);
    d->cleanup(h);
    puts("Phaedra DS LV2 DSP tests passed");
    return 0;
}